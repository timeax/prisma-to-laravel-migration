import { GeneratorOptions } from "@prisma/generator-helper";
import { ModelDefinition, EnumDefinition } from "./types";
export declare function generateLaravelModels(options: GeneratorOptions): Promise<{
    models: ModelDefinition[];
    enums: EnumDefinition[];
}>;
