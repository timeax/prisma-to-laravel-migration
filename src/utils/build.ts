import { relationTemplate } from "../generator/modeler/relationship/template-builder.js";
import { ModelDefinition } from "../generator/modeler/types";

/**
 * Build the “generated chunk” that lives between
 * // <prisma-laravel:start> … // :end
 */
export function buildModelContent(model: ModelDefinition): string {
   const out: string[] = [];

   /* ---- Traits -------------------------------------------------------- */
   if (model.traits?.length) {
      // printer adds the corresponding `use Foo\Bar;` imports elsewhere
      out.push(
         `use ${model.traits.join(", ")};`,
         ""  // blank line
      );
   }

   /* ---- Mass-assignment arrays --------------------------------------- */
   const pushArray = (label: string, arr?: string[], printEmpty?: boolean) => {
      if (arr && (arr.length || printEmpty)) {
         out.push(
            `protected $${label} = [` +
            arr.map(n => `'${n}'`).join(", ") +
            "];",
            ""
         );
      }
   };

   pushArray("fillable", model.properties.filter(p => p.fillable).map(p => p.name));
   pushArray("hidden", model.properties.filter(p => p.hidden).map(p => p.name));
   pushArray("guarded", model.guarded, true);
   pushArray("with", model.with);

   /* ---- Casts --------------------------------------------------------- */
   const castsLines: string[] = [];
   model.properties.forEach(p => {
      if (p.cast) castsLines.push(`'${p.name}' => '${p.cast}'`);
      else if (p.enumRef) castsLines.push(`'${p.name}' => ${p.enumRef}::class`);
      else if (p.phpType) castsLines.push(`'${p.name}' => ${p.phpType}`)
   });
   if (castsLines.length) {
      out.push(
         "protected $casts = [" +
         castsLines.join(", ") +
         "];",
         ""
      );
   }

   /* ---- Touches & Appends -------------------------------------------- */
   pushArray("touches", model.touches);
   pushArray("appends", model.appends);

   /* ---- Interfaces meta ---------------------------------------------- */
   if (Object.keys(model.interfaces).length) {
      const lines = Object.entries(model.interfaces).map(
         ([k, v]) =>
            `'${k}' => [${v.import ? ` 'import' => '${v.import}',` : ""} 'type' => '${v.type}' ]`
      );
      out.push(
         "public array $interfaces = [" +
         lines.join(", ") +
         "];",
         ""
      );
   }

   /* ---- Factory helper ----------------------------------------------- */
   if (model.factory) {
      out.push(
         `protected static string $factory = ${model.factory}::class;`,
         ""
      );
   }

   /* ---- boot() for observer ------------------------------------------ */
   if (model.observer) {
      out.push(
         "protected static function boot()\n" +
         "{\n" +
         "    parent::boot();\n" +
         `    static::observe(${model.observer}::class);` +
         "\n}",
         ""
      );
   }

   /* ------------------------------------------------------------------
 *  Append-accessor stubs
 * -----------------------------------------------------------------*/
   function accessorName(attr: string): string {
      // snake_case → StudlyCase
      return attr
         .split(/[_\-]/)
         .map(s => s.charAt(0).toUpperCase() + s.slice(1))
         .join("");
   }

   function buildAppendAccessors(appends?: string[]): string[] {
      if (!appends?.length) return [];

      return appends.map(attr => {
         const studly = accessorName(attr);
         return (
            `public function get${studly}Attribute()
{
    // TODO: compute '${attr}'
    return $this->attributes['${attr}'] ?? null;
}`
         );
      });
   }

   //--- handle relationships -----------------------------------------
   out.push(...model.relations.map(r => relationTemplate(r, { useCompoships: global._config?.model?.awobaz, indent: "  " })));
   //---
   out.push(...buildAppendAccessors(model.appends));
   /* ---- done --------------------------------------------------------- */
   return out.join("\n");
}