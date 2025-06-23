import { RelationshipOptions } from "./column-definition-types";

/**
 * The exact Prisma referential actions as strings in DMMF.Field
 */
type PrismaReferentialAction =
   | 'Cascade'
   | 'Restrict'
   | 'NoAction'
   | 'SetNull'
   | 'SetDefault';

/**
 * Map Prisma’s actions to the Laravel strings you defined in RelationshipOptions.
 */
const prismaToLaravelAction: Record<
   PrismaReferentialAction,
   Exclude<RelationshipOptions['onDelete'], undefined>
> = {
   Cascade: 'cascade',
   Restrict: 'restrict',
   NoAction: 'no action',
   SetNull: 'set null',
   SetDefault: 'set default',
};

/**
 * Convert a Prisma referential action into the corresponding Laravel action.
 * Falls back to 'restrict' if you ever get an unexpected value.
 */
export function mapPrismaActionToLaravel(
   action: string
): Exclude<RelationshipOptions['onDelete'], undefined> {
   return prismaToLaravelAction[action as PrismaReferentialAction] ?? 'restrict';
}