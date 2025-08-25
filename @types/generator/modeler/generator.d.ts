import { DMMF } from "@prisma/generator-helper";
import { ModelDefinition, EnumDefinition } from "./types";
/**
 * Build ModelDefinition[] + EnumDefinition[] from your DMMF.
 */
export declare class PrismaToLaravelModelGenerator {
    private dmmf;
    constructor(dmmf: DMMF.Document);
    primitiveTypes: string[];
    generateAll(): {
        models: ModelDefinition[];
        enums: EnumDefinition[];
    };
    private mapPrismaToPhpType;
    mapPrismaToPhpDocType(prismaType: string, nullable?: boolean, isList?: boolean): string;
}
