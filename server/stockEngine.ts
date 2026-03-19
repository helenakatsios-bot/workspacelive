import { Pool } from "pg";

export const RESERVING_STATUSES = new Set([
  "new", "confirmed", "in_production", "ready",
]);

export const DISPATCHING_STATUSES = new Set([
  "dispatched", "completed",
]);

export const NON_RESERVING_STATUSES = new Set([
  "cancelled", "on_hold",
]);

export function isReservingStatus(status: string): boolean {
  return RESERVING_STATUSES.has(status);
}

export function isDispatchingStatus(status: string): boolean {
  return DISPATCHING_STATUSES.has(status);
}

interface StockSnapshot {
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
}

async function getProductSnapshot(productId: string, pool: Pool): Promise<StockSnapshot> {
  const r = await pool.query(
    `SELECT physical_stock, reserved_stock, available_stock FROM products WHERE id = $1`,
    [productId]
  );
  if (!r.rows.length) return { physicalStock: 0, reservedStock: 0, availableStock: 0 };
  return {
    physicalStock: r.rows[0].physical_stock,
    reservedStock: r.rows[0].reserved_stock,
    availableStock: r.rows[0].available_stock,
  };
}

async function logMovement(
  pool: Pool,
  params: {
    productId: string;
    movementType: string;
    quantity: number;
    before: StockSnapshot;
    after: StockSnapshot;
    referenceType?: string;
    referenceId?: string;
    notes?: string;
    createdBy?: string;
  }
) {
  try {
    await pool.query(
      `INSERT INTO stock_movements
        (product_id, movement_type, quantity,
         physical_before, physical_after,
         reserved_before, reserved_after,
         available_before, available_after,
         reference_type, reference_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        params.productId,
        params.movementType,
        params.quantity,
        params.before.physicalStock,
        params.after.physicalStock,
        params.before.reservedStock,
        params.after.reservedStock,
        params.before.availableStock,
        params.after.availableStock,
        params.referenceType || null,
        params.referenceId || null,
        params.notes || null,
        params.createdBy || null,
      ]
    );
  } catch (e) {
    console.error("[STOCK] Failed to log movement:", e);
  }
}

export async function recalculateProductStock(productId: string, pool: Pool): Promise<void> {
  const snap = await getProductSnapshot(productId, pool);

  const reservedResult = await pool.query(
    `SELECT COALESCE(SUM(ol.qty_reserved), 0) AS total_reserved
     FROM order_lines ol
     JOIN orders o ON o.id = ol.order_id
     WHERE ol.product_id = $1
       AND o.status = ANY($2)`,
    [productId, Array.from(RESERVING_STATUSES)]
  );

  const reserved = parseInt(reservedResult.rows[0].total_reserved) || 0;
  const physical = snap.physicalStock;
  const available = Math.max(0, physical - reserved);

  await pool.query(
    `UPDATE products SET reserved_stock = $1, available_stock = $2 WHERE id = $3`,
    [reserved, available, productId]
  );
}

export async function reserveOrderLines(
  orderId: string,
  pool: Pool,
  userId?: string
): Promise<void> {
  const orderResult = await pool.query(
    `SELECT status FROM orders WHERE id = $1`,
    [orderId]
  );
  if (!orderResult.rows.length) return;
  const status = orderResult.rows[0].status;

  if (!isReservingStatus(status)) return;

  const lines = await pool.query(
    `SELECT id, product_id, quantity FROM order_lines WHERE order_id = $1 AND product_id IS NOT NULL`,
    [orderId]
  );

  for (const line of lines.rows) {
    const qty = line.quantity;
    const productId = line.product_id;

    const before = await getProductSnapshot(productId, pool);

    await pool.query(
      `UPDATE order_lines SET qty_reserved = $1 WHERE id = $2`,
      [qty, line.id]
    );

    await recalculateProductStock(productId, pool);
    const after = await getProductSnapshot(productId, pool);

    await logMovement(pool, {
      productId,
      movementType: "RESERVE",
      quantity: qty,
      before,
      after,
      referenceType: "ORDER",
      referenceId: orderId,
      notes: `Reserved for order ${orderId}`,
      createdBy: userId,
    });
  }
}

export async function releaseOrderLines(
  orderId: string,
  pool: Pool,
  userId?: string
): Promise<void> {
  const lines = await pool.query(
    `SELECT id, product_id, qty_reserved FROM order_lines WHERE order_id = $1 AND product_id IS NOT NULL`,
    [orderId]
  );

  for (const line of lines.rows) {
    const released = parseInt(line.qty_reserved) || 0;
    if (released === 0) continue;

    const productId = line.product_id;
    const before = await getProductSnapshot(productId, pool);

    await pool.query(
      `UPDATE order_lines SET qty_reserved = 0 WHERE id = $1`,
      [line.id]
    );

    await recalculateProductStock(productId, pool);
    const after = await getProductSnapshot(productId, pool);

    await logMovement(pool, {
      productId,
      movementType: "CANCELLATION_RELEASE",
      quantity: released,
      before,
      after,
      referenceType: "ORDER",
      referenceId: orderId,
      notes: `Released from order ${orderId}`,
      createdBy: userId,
    });
  }
}

export async function adjustReservationForLine(
  lineId: string,
  orderId: string,
  productId: string,
  newQty: number,
  pool: Pool,
  userId?: string
): Promise<void> {
  const orderResult = await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
  if (!orderResult.rows.length) return;
  const status = orderResult.rows[0].status;

  const lineResult = await pool.query(`SELECT qty_reserved FROM order_lines WHERE id = $1`, [lineId]);
  if (!lineResult.rows.length) return;

  const currentReserved = parseInt(lineResult.rows[0].qty_reserved) || 0;
  const targetReserved = isReservingStatus(status) ? newQty : 0;
  const delta = targetReserved - currentReserved;

  if (delta === 0) return;

  const before = await getProductSnapshot(productId, pool);

  await pool.query(`UPDATE order_lines SET qty_reserved = $1 WHERE id = $2`, [targetReserved, lineId]);
  await recalculateProductStock(productId, pool);

  const after = await getProductSnapshot(productId, pool);

  const movementType = delta > 0 ? "ORDER_EDIT_INCREASE" : "ORDER_EDIT_DECREASE";
  await logMovement(pool, {
    productId,
    movementType,
    quantity: Math.abs(delta),
    before,
    after,
    referenceType: "ORDER",
    referenceId: orderId,
    notes: `Qty adjustment: ${currentReserved} → ${targetReserved}`,
    createdBy: userId,
  });
}

export async function handleStatusChange(
  orderId: string,
  oldStatus: string,
  newStatus: string,
  pool: Pool,
  userId?: string
): Promise<void> {
  const wasReserving = isReservingStatus(oldStatus);
  const nowReserving = isReservingStatus(newStatus);
  const nowDispatching = isDispatchingStatus(newStatus);
  const nowReleasing = NON_RESERVING_STATUSES.has(newStatus);

  if (nowDispatching && !isDispatchingStatus(oldStatus)) {
    await dispatchOrderLines(orderId, pool, userId);
    return;
  }

  if (nowReleasing && !NON_RESERVING_STATUSES.has(oldStatus)) {
    await releaseOrderLines(orderId, pool, userId);
    return;
  }

  if (!wasReserving && nowReserving) {
    await reserveOrderLines(orderId, pool, userId);
    return;
  }
}

export async function dispatchOrderLines(
  orderId: string,
  pool: Pool,
  userId?: string
): Promise<void> {
  const lines = await pool.query(
    `SELECT id, product_id, quantity, qty_reserved FROM order_lines WHERE order_id = $1 AND product_id IS NOT NULL`,
    [orderId]
  );

  for (const line of lines.rows) {
    const productId = line.product_id;
    const qtyToDispatch = parseInt(line.quantity) || 0;
    const currentReserved = parseInt(line.qty_reserved) || 0;

    const before = await getProductSnapshot(productId, pool);

    await pool.query(`UPDATE order_lines SET qty_reserved = 0, qty_dispatched = $1 WHERE id = $2`, [qtyToDispatch, line.id]);

    await pool.query(
      `UPDATE products SET physical_stock = GREATEST(0, physical_stock - $1) WHERE id = $2`,
      [qtyToDispatch, productId]
    );

    await recalculateProductStock(productId, pool);
    const after = await getProductSnapshot(productId, pool);

    await logMovement(pool, {
      productId,
      movementType: "DISPATCH",
      quantity: qtyToDispatch,
      before,
      after,
      referenceType: "ORDER",
      referenceId: orderId,
      notes: `Dispatched from order ${orderId}`,
      createdBy: userId,
    });
  }
}

export async function receiveStock(
  productId: string,
  qty: number,
  pool: Pool,
  userId?: string,
  notes?: string
): Promise<void> {
  const before = await getProductSnapshot(productId, pool);

  await pool.query(
    `UPDATE products SET physical_stock = physical_stock + $1 WHERE id = $2`,
    [qty, productId]
  );

  await recalculateProductStock(productId, pool);
  const after = await getProductSnapshot(productId, pool);

  await logMovement(pool, {
    productId,
    movementType: "RECEIPT",
    quantity: qty,
    before,
    after,
    referenceType: "MANUAL",
    notes: notes || `Manual stock receipt of ${qty} units`,
    createdBy: userId,
  });
}

export async function adjustStockManual(
  productId: string,
  newPhysical: number,
  pool: Pool,
  userId?: string,
  notes?: string
): Promise<void> {
  const before = await getProductSnapshot(productId, pool);
  const delta = newPhysical - before.physicalStock;

  await pool.query(
    `UPDATE products SET physical_stock = $1 WHERE id = $2`,
    [newPhysical, productId]
  );

  await recalculateProductStock(productId, pool);
  const after = await getProductSnapshot(productId, pool);

  await logMovement(pool, {
    productId,
    movementType: "ADJUSTMENT",
    quantity: Math.abs(delta),
    before,
    after,
    referenceType: "MANUAL",
    notes: notes || `Manual adjustment: ${before.physicalStock} → ${newPhysical}`,
    createdBy: userId,
  });
}
