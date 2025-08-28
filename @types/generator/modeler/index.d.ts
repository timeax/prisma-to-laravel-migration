import { GeneratorOptions } from "@prisma/generator-helper";
import { StubConfig } from "../../utils/utils.js";
import { ModelDefinition, EnumDefinition } from "./types";
import { ModelConfigOverride } from "types/laravel-config.js";
export interface ModelConfig extends StubConfig, Omit<ModelConfigOverride, 'groups' | 'stubDir'> {
}
export declare function generateLaravelModels(options: GeneratorOptions): Promise<{
    models: ModelDefinition[];
    enums: EnumDefinition[];
}>;
