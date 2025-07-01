import { ModelDefinition, EnumDefinition } from 'generator/modeler/types';
import { StubConfig } from '../utils/utils.js';
/**
 * Loads JS‐based stubs for both models and enums, and evaluates
 * their `${…}` placeholders at runtime.
 *
 * Stub‐resolution precedence:
 *  1) per‐table/group/index via resolveStub()
 *  2) global override (if provided)
 *  3) error
 */
export declare class StubModelPrinter {
    #private;
    /** stubDir + groups config */
    private cfg;
    /** global override for all models */
    private globalModelStub?;
    /** global override for all enums */
    private globalEnumStub?;
    private modelTmpl;
    private enumTmpl;
    constructor(
    /** stubDir + groups config */
    cfg: StubConfig, 
    /** global override for all models */
    globalModelStub?: string | undefined, 
    /** global override for all enums */
    globalEnumStub?: string | undefined);
    /** Render a single enum class. */
    printEnum(enumDef: EnumDefinition): string;
    /** Render multiple enums, separated by two newlines. */
    printAllEnums(enums: EnumDefinition[]): string;
    /** Render a single model class with injected `content`. */
    printModel(model: ModelDefinition, enums: EnumDefinition[], content: string): string;
    /** Render multiple models, each with its own `content`, separated by two newlines. */
    printAllModels(models: ModelDefinition[], enums: EnumDefinition[], contents: string[]): string;
    /** Render enums first, then models, joined by two newlines. */
    printAll(models: ModelDefinition[], enums: EnumDefinition[], contents: string[]): string;
    /** Load & compile the correct model stub for `tableName`. */
    private ensureModelStub;
    /** Load & compile the correct enum stub for `enumDef.name`. */
    private ensureEnumStub;
}
