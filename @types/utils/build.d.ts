import { ModelDefinition } from "../generator/modeler/types";
/**
 * Build the “generated chunk” that lives between
 * // <prisma-laravel:start> … // :end
 */
export declare function buildModelContent(model: ModelDefinition): string;
