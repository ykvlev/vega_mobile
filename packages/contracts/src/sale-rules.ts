import { z } from 'zod';

const identifier = z.string().uuid();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const metre = z.number().int().min(1).max(18);

const warehouseInventory = z.strictObject({
  warehouseId: identifier,
  skuId: identifier,
  wholeRolls: count,
  readyPieces: z
    .array(z.strictObject({ lengthMetres: metre, count }))
    .max(18)
    .refine(
      (pieces) =>
        new Set(pieces.map((piece) => piece.lengthMetres)).size ===
        pieces.length,
      'Ready-piece lengths must be unique within a warehouse',
    ),
});

/** Internal input, not a 1C wire protocol or a public product DTO.
 * The adapter must establish freshness and a complete snapshot before use.
 * Missing warehouses are unknown inventory, never an implicit zero.
 */
export const SaleInventorySchema = z
  .strictObject({
    skuId: identifier,
    family: z.enum(['color', 'color_ultima', 'other']),
    freshness: z.enum(['fresh', 'stale', 'unavailable']),
    includedWarehouseIds: z.array(identifier).min(1).max(1000),
    warehouses: z.array(warehouseInventory).max(1000),
  })
  .superRefine((value, context) => {
    const included = new Set(value.includedWarehouseIds);
    const reported = new Set(
      value.warehouses.map((warehouse) => warehouse.warehouseId),
    );
    if (
      included.size !== value.includedWarehouseIds.length ||
      reported.size !== value.warehouses.length ||
      included.size !== reported.size ||
      value.warehouses.some(
        (warehouse) =>
          !included.has(warehouse.warehouseId) ||
          warehouse.skuId !== value.skuId,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Inventory must cover each included warehouse exactly once for the same SKU',
      });
    }
    let wholeRolls = 0;
    for (const warehouse of value.warehouses) {
      wholeRolls += warehouse.wholeRolls;
      if (!Number.isSafeInteger(wholeRolls)) {
        context.addIssue({
          code: 'custom',
          message: 'Whole-roll total exceeds safe integer range',
        });
        break;
      }
    }
  });

export type SaleInventory = z.infer<typeof SaleInventorySchema>;
export type CommercialApproval =
  'pending' | 'approved' | 'rejected' | 'revoked';
export type SaleAvailability =
  | { state: 'hidden' }
  | { state: 'unavailable' }
  | {
      state: 'available';
      wholeRollAvailable: boolean;
      /** Permission only: it does not prove stock for a requested new cut. */
      cutPiecesPermitted: boolean;
      readyPieceOptions: Array<{ lengthMetres: number; available: boolean }>;
    };

/** Evaluate trusted server-side input. Never send raw inventory to a guest.
 * Approval is checked before parsing inventory, so hidden responses cannot reveal
 * whether inventory exists, is malformed, stale or subject to a cutting rule.
 * No reservation, prices, manager assignment or guessed stock labels are added.
 */
export function evaluateSaleAvailability(
  approval: CommercialApproval | undefined,
  inventory: unknown,
): SaleAvailability {
  if (approval !== 'approved') return { state: 'hidden' };
  const parsed = SaleInventorySchema.safeParse(inventory);
  if (!parsed.success || parsed.data.freshness !== 'fresh')
    return { state: 'unavailable' };

  const { family, warehouses } = parsed.data;
  const wholeRolls = warehouses.reduce(
    (total, warehouse) => total + warehouse.wholeRolls,
    0,
  );
  const cutPiecesPermitted = family === 'other' || wholeRolls > 2;
  return {
    state: 'available',
    wholeRollAvailable: wholeRolls > 0,
    cutPiecesPermitted,
    readyPieceOptions: Array.from({ length: 18 }, (_, index) => {
      const lengthMetres = index + 1;
      return {
        lengthMetres,
        available:
          cutPiecesPermitted &&
          warehouses.some((warehouse) =>
            warehouse.readyPieces.some(
              (piece) => piece.lengthMetres === lengthMetres && piece.count > 0,
            ),
          ),
      };
    }),
  };
}
