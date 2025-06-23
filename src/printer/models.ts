import fs from 'fs';
import path from 'path';
import { ModelDefinition, EnumDefinition } from 'generator/modeler/types';
import { formatStub, resolveStub, StubConfig } from '../generator/utils.js';

/**
 * Loads JS‐based stubs for both models and enums, and evaluates
 * their `${…}` placeholders at runtime.
 *
 * Stub‐resolution precedence:
 *  1) per‐table/group/index via resolveStub()
 *  2) global override (if provided)
 *  3) error
 */
export class StubModelPrinter {
   // caches for current stub paths
   #currentModelStub = '';
   #currentEnumStub = '';

   // compiled template functions
   private modelTmpl!: (
      model: ModelDefinition,
      enums: EnumDefinition[],
      content: string
   ) => string;
   private enumTmpl!: (enumDef: EnumDefinition) => string;

   constructor(
      /** stubDir + groups config */
      private cfg: StubConfig,
      /** global override for all models */
      private globalModelStub?: string,
      /** global override for all enums */
      private globalEnumStub?: string
   ) { }

   /** Render a single enum class. */
   public printEnum(enumDef: EnumDefinition): string {
      this.ensureEnumStub(enumDef.name);
      return this.enumTmpl(enumDef);
   }

   /** Render multiple enums, separated by two newlines. */
   public printAllEnums(enums: EnumDefinition[]): string {
      return enums.map(e => this.printEnum(e)).join('\n\n');
   }

   /** Render a single model class with injected `content`. */
   public printModel(
      model: ModelDefinition,
      enums: EnumDefinition[],
      content: string
   ): string {
      this.ensureModelStub(model.tableName);
      return this.modelTmpl(model, enums, content);
   }

   /** Render multiple models, each with its own `content`, separated by two newlines. */
   public printAllModels(
      models: ModelDefinition[],
      enums: EnumDefinition[],
      contents: string[]
   ): string {
      return models
         .map((m, i) => this.printModel(m, enums, contents[i]))
         .join('\n\n');
   }

   /** Render enums first, then models, joined by two newlines. */
   public printAll(
      models: ModelDefinition[],
      enums: EnumDefinition[],
      contents: string[]
   ): string {
      const outEnums = this.printAllEnums(enums);
      const outModels = this.printAllModels(models, enums, contents);
      return [outEnums, outModels].filter(Boolean).join('\n\n');
   }

   /** Load & compile the correct model stub for `tableName`. */
   private ensureModelStub(tableName: string) {
      // 1) try per‐table/group/index
      const resolved = resolveStub(this.cfg, 'model', tableName);

      // 2) fall back to globalModelStub if none found
      const stubPath = resolved
         ? resolved
         : this.globalModelStub
            ? path.resolve(process.cwd(), this.globalModelStub)
            : (() => { throw new Error(`No stub found for model '${tableName}'`); })();

      if (stubPath === this.#currentModelStub) return;

      const raw = fs.readFileSync(path.resolve(stubPath), 'utf-8').trim();
      this.modelTmpl = new Function(
         'model', 'enums', 'content',
         `return \`${formatStub(raw)}\`;`
      ) as typeof this.modelTmpl;

      this.#currentModelStub = stubPath;
   }

   /** Load & compile the correct enum stub for `enumDef.name`. */
   private ensureEnumStub(name: string) {
      // 1) try per‐enum/group/index
      const resolved = resolveStub(this.cfg, 'enum', name);

      // 2) fall back to globalEnumStub if none found
      const stubPath = resolved
         ? resolved
         : this.globalEnumStub
            ? path.resolve(process.cwd(), this.globalEnumStub)
            : (() => {
               throw new Error(`No stub found for enum '${name}'`);
            })();

      if (stubPath === this.#currentEnumStub) return;

      const raw = fs.readFileSync(path.resolve(stubPath), 'utf-8').trim();
      this.enumTmpl = new Function(
         'enumDef',
         `return \`${formatStub(raw)}\`;`
      ) as typeof this.enumTmpl;

      this.#currentEnumStub = stubPath;
   }
}