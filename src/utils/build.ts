import { ModelDefinition } from "generator/modeler/types";

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
   pushArray("with", model.guarded);

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
            `'${k}' => {${v.import ? ` import: '${v.import}',` : ""} type: '${v.type}' }`
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
   model.relations.forEach(rel => {
      const isMorph = rel.type.startsWith('morph'); // morphTo, morphToMany, morphedByMany
      const usingAwobaz = !!global._config?.model?.awobaz;
      const isComposite = Array.isArray(rel.foreignKey) && rel.foreignKey.length > 1;

      const asArray = (v?: string | string[]) =>
         Array.isArray(v) ? v : (v ? [v] : []);

      const foreignKeys = asArray(rel.foreignKey);
      const localKeys = asArray(rel.localKey);

      const args: string[] = [];

      // 1) first argument
      if (isMorph) {
         args.push(`'${rel.morphType ?? rel.name}'`);
      } else {
         args.push(rel.modelClass); // e.g. Related::class
      }

      // 2) many-to-many pivot table (if any)
      const isManyToMany =
         rel.type === 'belongsToMany' ||
         rel.type === 'morphToMany';

      if (isManyToMany && rel.pivotTable) {
         args.push(`'${rel.pivotTable}'`);
      }

      // 3) base key args (single-column signature)
      if (isComposite && usingAwobaz) {
         // Awobaz supports arrays
         const fkArray = `[${foreignKeys.map(k => `'${k}'`).join(', ')}]`;
         const lkArray = `[${localKeys.map(k => `'${k}'`).join(', ')}]`;
         args.push(fkArray, lkArray);
      } else {
         // Standard Laravel: use the first pair as the "canonical" FK/ownerKey
         if (foreignKeys.length) args.push(`'${foreignKeys[0]}'`);
         if (localKeys.length) args.push(`'${localKeys[0]}'`);
      }

      // 4) build base relation call
      const call = `$this->${rel.type}(${args.join(', ')})`;

      // 5) if composite && !awobaz, append WHERE constraints for remaining pairs
      let chained = call;
      if (isComposite && !usingAwobaz) {
         // For remaining pairs: index 1..n-1
         // We need to know direction per relation type:
         // - belongsTo(Related, localFK, ownerKey): enforce ownerKey[i] = $this->localFK[i]
         // - hasOne/hasMany(Related, foreignKey, localKey): enforce foreignKey[i] = $this->localKey[i]
         const extraPairs = foreignKeys
            .slice(1)
            .map((fk, i) => {
               const lk = localKeys[i + 1]; // align the pair
               // Guard: only add if both sides exist
               if (!fk || !lk) return null;

               if (rel.type === 'belongsTo') {
                  // related.ownerKey[i] = this.localFK[i]
                  // ->where('ownerKey_i', $this->getAttribute('localFK_i'))
                  return `->where('${localKeys[i + 1]}', $this->getAttribute('${fk}'))`;
               } else if (rel.type === 'hasOne' || rel.type === 'hasMany') {
                  // related.foreignKey[i] = this.localKey[i]
                  return `->where('${fk}', $this->getAttribute('${lk}'))`;
               } else {
                  // For many-to-many or morph variants, we don't have reliable extra-key mapping here.
                  // (If you pass composite via Awobaz, arrays handle this.)
                  return null;
               }
            })
            .filter(Boolean) as string[];

         if (extraPairs.length) {
            chained = `${chained}${extraPairs.join('')}`;
         }
      }

      const comment = rel.pivotTable ? ` // pivot: ${rel.pivotTable}` : '';
      const line = `return ${chained};${comment}`;

      out.push(
         `public function ${rel.name}()`,
         '{',
         `    ${line}`,
         '}',
         ''
      );
   });
   //---
   out.push(...buildAppendAccessors(model.appends));
   /* ---- done --------------------------------------------------------- */
   return out.join("\n");
}