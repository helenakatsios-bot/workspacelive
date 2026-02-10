import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bot, Send, Plus, Trash2, Loader2, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Conversation, Message } from "@shared/schema";

type ConversationWithMessages = Conversation & { messages: Message[] };

export default function CustomerAgentPage() {
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversationsList = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: activeConversation, isLoading: loadingMessages } = useQuery<ConversationWithMessages>({
    queryKey: ["/api/conversations", activeConversationId],
    enabled: !!activeConversationId,
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages, streamingContent, scrollToBottom]);

  const createConversation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/conversations", { title: "New Chat" });
      return res.json();
    },
    onSuccess: (data: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setActiveConversationId(data.id);
    },
  });

  const deleteConversation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: (_: unknown, id: number) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    },
  });

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || !activeConversationId || isStreaming) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsStreaming(true);
    setStreamingContent("");

    queryClient.setQueryData<ConversationWithMessages>(
      ["/api/conversations", activeConversationId],
      (old) => {
        if (!old) return old;
        return {
          ...old,
          messages: [
            ...old.messages,
            {
              id: Date.now(),
              conversationId: activeConversationId,
              role: "user",
              content: userMessage,
              createdAt: new Date(),
            },
          ],
        };
      }
    );

    try {
      const response = await fetch(`/api/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMessage }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to send message");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) {
                break;
              }
              if (data.content) {
                accumulated += data.content;
                setStreamingContent(accumulated);
              }
              if (data.error) {
                console.error("Stream error:", data.error);
              }
            } catch {
              // ignore parse errors for incomplete chunks
            }
          }
        }
      }

      const firstWords = userMessage.split(" ").slice(0, 5).join(" ");
      const currentConvo = queryClient.getQueryData<ConversationWithMessages>(["/api/conversations", activeConversationId]);
      if (currentConvo && currentConvo.title === "New Chat") {
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", activeConversationId] });
    }
  }, [inputValue, activeConversationId, isStreaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const messages = activeConversation?.messages || [];

  return (
    <div className="flex flex-col h-full" data-testid="millie-page">
      <div className="px-6 pt-6 pb-2">
        <PageHeader
          title="Ask Millie"
          description="Your AI assistant for navigating the CRM"
        />
      </div>

      <div className="flex flex-1 gap-4 px-6 pb-6 min-h-0">
        <Card className="w-64 shrink-0 flex flex-col">
          <div className="p-3 border-b flex items-center justify-between gap-1">
            <span className="text-sm font-medium">Conversations</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => createConversation.mutate()}
              disabled={createConversation.isPending}
              data-testid="button-new-conversation"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loadingConversations && (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loadingConversations && conversationsList.length === 0 && (
                <p className="text-xs text-muted-foreground p-2 text-center">
                  No conversations yet. Click + to start.
                </p>
              )}
              {conversationsList.map((convo) => (
                <div
                  key={convo.id}
                  className={`group flex items-center gap-1 rounded-md cursor-pointer px-2 py-1.5 text-sm hover-elevate ${
                    activeConversationId === convo.id
                      ? "bg-accent text-accent-foreground"
                      : ""
                  }`}
                  onClick={() => setActiveConversationId(convo.id)}
                  data-testid={`conversation-item-${convo.id}`}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{convo.title}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 invisible group-hover:visible shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation.mutate(convo.id);
                    }}
                    data-testid={`button-delete-conversation-${convo.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        <Card className="flex-1 flex flex-col min-h-0">
          {!activeConversationId ? (
            <CardContent className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Bot className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg" data-testid="text-millie-welcome">Hi, I'm Millie!</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    I'm your AI assistant for the Purax CRM. Ask me anything about how to use the system - from creating orders to managing contacts.
                  </p>
                </div>
                <Button
                  onClick={() => createConversation.mutate()}
                  disabled={createConversation.isPending}
                  data-testid="button-start-chat"
                >
                  {createConversation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Start a conversation
                </Button>
              </div>
            </CardContent>
          ) : (
            <>
              <ScrollArea className="flex-1 p-4">
                {loadingMessages && (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {messages.length === 0 && !loadingMessages && !streamingContent && (
                  <div className="flex items-center justify-center p-8 text-center">
                    <div>
                      <Bot className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                      <p className="text-sm text-muted-foreground">
                        Ask me anything about the CRM!
                      </p>
                    </div>
                  </div>
                )}
                <div className="space-y-4 max-w-3xl mx-auto">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
                  ))}
                  {streamingContent && (
                    <MessageBubble role="assistant" content={streamingContent} />
                  )}
                  {isStreaming && !streamingContent && (
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex items-center gap-1 pt-2">
                        <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="border-t p-4">
                <div className="flex gap-2 max-w-3xl mx-auto">
                  <Textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Millie a question..."
                    className="resize-none min-h-[40px] max-h-[120px]"
                    rows={1}
                    disabled={isStreaming}
                    data-testid="input-millie-message"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!inputValue.trim() || isStreaming}
                    data-testid="button-send-message"
                  >
                    {isStreaming ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function MessageBubble({ role, content }: { role: string; content: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end" data-testid="message-user">
        <div className="bg-primary text-primary-foreground rounded-lg px-4 py-2.5 max-w-[80%]">
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3" data-testid="message-assistant">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="bg-muted rounded-lg px-4 py-2.5 max-w-[80%]">
        <p className="text-sm whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
