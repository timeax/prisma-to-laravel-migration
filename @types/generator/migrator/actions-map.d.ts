import { RelationshipOptions } from "./column-definition-types";
/**
 * Convert a Prisma referential action into the corresponding Laravel action.
 * Falls back to 'restrict' if you ever get an unexpected value.
 */
export declare function mapPrismaActionToLaravel(action: string): Exclude<RelationshipOptions['onDelete'], undefined>;
