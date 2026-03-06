import {DMMF} from "@prisma/generator-helper";
import {ColumnDefinitionGenerator} from "./column-definition.js";
import {RuleResolver} from "./rule-definition.js";
import {ColumnDefinition} from "@/types/column-definition-types";
import {DefaultMaps, Rule} from "./rules.js";
import {decorate, getConfig, isForMigrator, parseSilentDirective} from "@/utils/utils";

/**
 * The shape returned by the generator—pure data, no rendering.
 */
export interface Migration {
    isIgnored: any;
    /** Table name (from dbName or model name) */
    tableName: string;
    name: string;
    /** Fully resolved migration lines for that table */
    statements: string[];
    /** The ColumnDefinition objects used to produce those statements */
    definitions: ColumnDefinition[];
    /** Marks this entire model as ignored */
    local?: boolean;
}

export class PrismaToLaravelMigrationGenerator {
    private columnGen: ColumnDefinitionGenerator;
    private ruleResolver: RuleResolver;

    constructor(private dmmf: DMMF.Document, customRules: Rule[] = [], defaultMaps: DefaultMaps = {}) {
        this.columnGen = new ColumnDefinitionGenerator(dmmf);
        this.ruleResolver = new RuleResolver(dmmf, customRules, defaultMaps);
    }

    /**
     * Given an array of ColumnDefinition, apply rules and return PHP snippets.
     * Skips any definitions marked `ignore = true`.
     */
    private resolveColumns(defs: ColumnDefinition[]): string[] {
        // give the resolver full context for this model
        this.ruleResolver.setDefinitions(defs);

        /* ---------- 1. per-column rules (two-step flatMap) ------------------ */
        const columnLines = defs
            .flatMap(def => {
                // step-1: run the rule, keep def so we can see flags it sets
                const {snippet} = this.ruleResolver.resolve(def);
                return {def, snippet};
            })
            .flatMap(({def, snippet}) => {
                // step-2: honour any def.ignore set by the rule
                return def.ignore ? [] : snippet;
            });

        /* ---------- 2. table-level utilities (PK, indexes, …) --------------- */
        const utilityLines = this.ruleResolver.resolveUtilities();

        /* ---------- 3. combine: columns first, utilities last --------------- */
        return [...columnLines, ...utilityLines];
    }

    private buildModelIndexMap(): Map<string, DMMF.Index[]> {
        const indexMap = new Map<string, DMMF.Index[]>();

        for (const idx of this.dmmf.datamodel.indexes) {
            if (idx.isDefinedOnField) continue;

            const modelIndexes = indexMap.get(idx.model) ?? [];
            modelIndexes.push(idx);
            indexMap.set(idx.model, modelIndexes);
        }

        return indexMap;
    }

    private resolveModel(model: DMMF.Model, indexMap: Map<string, DMMF.Index[]>): Migration {
        const tableName = model.dbName ?? model.name;
        const definitions = this.columnGen.getColumns(tableName);
        const columns = this.resolveColumns(definitions);
        const utilities = this.buildTableUtilities(indexMap.get(model.name) ?? []);
        const isSilent = isForMigrator(parseSilentDirective(model.documentation ?? ""));

        return {
            tableName,
            name: decorate(tableName, getConfig('migrator')!),
            isIgnored: isSilent,
            local: isSilent,
            definitions,
            statements: [...columns, ...utilities],
        };
    }

    /**
     * Generate a Migration object for each model, using per‐model definitions.
     */
    public generateAll(): Migration[] {
        const indexMap = this.buildModelIndexMap();
        return this.dmmf.datamodel.models.map(model => this.resolveModel(model, indexMap));
    }

    /**
     * Build table-level helpers (composite PK / composite & multi-col indexes / unique fields).
     *
     * @param indexes  The Prisma DMMF.Index[] *for this model only*.
     *                 Note `indexes` are all where isDefinedOnField is false.
     */
    public buildTableUtilities(indexes: DMMF.Index[] = []): string[] {
        const out: string[] = [];

        /**
         end products should fit Laravel’s Schema builder:
         $table->primary($columns, $name = null, $algorithm = null);
         $table->index($columns,   $name = null, $algorithm = null);
         $table->unique($columns,  $name = null, $algorithm = null);
         where $columns is string or string[]
         */

        const buildIndexStatement = (method: string, idx: DMMF.Index): string => {
            const columns = idx.fields.length > 1
                ? `[${idx.fields.map(f => `'${f.name}'`).join(", ")}]`
                : `'${idx.fields[0].name}'`;

            const name = idx.dbName ? `, '${idx.dbName ?? idx.name}'` : '';
            const algorithm = idx.algorithm ? `, '${idx.algorithm}'` : '';

            return `$table->${method}(${columns}${name}${algorithm});`;
        };

        const pushByType = (type: DMMF.Index["type"], method: string): void => {
            for (const idx of indexes) {
                if (idx.type !== type) continue;
                out.push(buildIndexStatement(method, idx));
            }
        };

        /* ── 1️⃣  Primary keys ─────────────────────────────────────────── */
        pushByType("id", "primary");

        /* ── 2️⃣  Composite indexes ───────────────────────────────────── */
        pushByType("normal", "index");

        /* ── 3️⃣  Composite unique keys ───────────────────────────────── */
        pushByType("unique", "unique");

        /* ── 4️⃣  Prisma model‐level FULLTEXT indexes ─────────────────── */
        pushByType("fulltext", "fullText");

        return out;
    }
}