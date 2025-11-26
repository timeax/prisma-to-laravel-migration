# Prisma Laravel Migrate

A generator plugin that translates your **Prisma schema** into Laravel‑ready  
**Database Migrations**, **Eloquent Models**, and **Enum classes**.  
Built in strict TypeScript with fully‑customisable stubs, grouping, and smart merge updates.

---

## 📦 Installation

```bash
npm install prisma-laravel-migrate --save-dev
# requires the Prisma CLI in your project
```

---
🛠️ Configuration layers

The generators read options in **three tiers (highest → lowest)**:

1. **Environment override** – `PRISMA_LARAVEL_CFG=/path/to/laravel.config.js`
2. **Shared project file** – **`prisma/laravel.config.js`** (auto‑loaded if present)
3. **`generator … { … }` blocks** in `schema.prisma`

A key in tier ① shadows the same key in ② and ③; tier ② shadows tier ③.

### 📁 Shared project file — `prisma/laravel.config.js`

```js
/** Global to all Prisma‑Laravel generators */
module.exports = {
  /* -- table decoration ------------------------------- */
  tablePrefix: "tx_",
  tableSuffix: "_arch",

  /* -- default stub root ------------------------------ */
  stubDir: "prisma/stubs",

  /* -- global dry‑run --------------------------------- */
  noEmit: false,

  /* -- override default outputs ----------------------- */
  output: {
    migrations: "database/migrations",
    models:      "app/Models",
    enums:       "app/Enums"
  },

  /* -- per‑generator overrides ------------------------ */
  migrate: {
    groups: "./prisma/migrate-groups.js",
    rules : "./prisma/custom-rules.js"
  },

  modeler: {
    groups: [
      { stubFile: "audit.stub", tables: ["logs","audit_trails"] }
    ],
    outputEnumDir: "app/Enums",
    overwriteExisting: true,
    allowedPivotExtraFields: ["scope"]
  }
};
```

>`Updated! I added a new section in the canvas—“Related Generator Options (Formatting & Compoships)”—covering:
prettier (per-generator): what it does, defaults, config snippets, and a typings excerpt.
modeler.awobaz: what enabling Compoships changes, config example, and a reminder to composer require it.`

<details>
<summary>Type reference</summary>

```ts
export interface Rule {
   test(
      def: ColumnDefinition,
      allDefs: ColumnDefinition[],
      dmmf: DMMF.Document
   ): boolean;
   render(
      def: ColumnDefinition,
      allDefs: ColumnDefinition[],
      dmmf: DMMF.Document
   ): Render;
}

/* ------------------------------------------------------------
 *  Re-usable stub-group description
 * ---------------------------------------------------------- */
export interface StubGroupConfig extends FlexibleStubGroup {
   /** Path relative to stubDir/<type>/  (e.g. "auth.stub") */
   stubFile: string;
   tables: string[];      // ["users","accounts",…] or enum names
}

/**
 * Back-compat + new matching options.
 * Supply EITHER `tables` *or* (`include` / `exclude` / `pattern`).
 */
interface FlexibleStubGroup {
   /** Path relative to stubDir/<type>/, e.g. "auth.stub" */
   stubFile: string;

   /** Old style - explicit white-list */
   tables?: string[];

   /** New style – include list ( '*' means “all tables” ) */
   include?: string[] | '*';

   /** New style – blacklist applied after include / pattern */
   exclude?: string[];

   /** New style – RegExp OR minimatch glob(s) */
   pattern?: RegExp | string | Array<RegExp | string>;
}


/* ------------------------------------------------------------
 *  Per-generator overrides  (migration / modeler)
 * ---------------------------------------------------------- */
export interface LaravelGeneratorConfig {
   tablePrefix?: string;
   tableSuffix?: string;

   /** Override stubDir only for this generator */
   stubDir?: string;

   /** Where the generated PHP goes (overrides block) */
   outputDir?: string;

   overwriteExisting?: boolean;
   /** Allow formatting with prettier */
   prettier?: boolean;
   /**
    * Stub grouping:
    *  • string  – path to a JS module exporting StubGroupConfig[]
    *  • array   – the group definitions themselves
    */
   groups?: string | StubGroupConfig[];

   /** Skip file emission for *this* generator only */
   noEmit?: boolean;

   /**Default namespace for local imports */
   namespace?: "App\\"
}

/* ------------------------------------------------------------
 *  Top-level shared config  (visible to all generators)
 * ---------------------------------------------------------- */
export interface LaravelSharedConfig {
   /** Table name decoration */
   tablePrefix?: string;
   tableSuffix?: string;

   /** Default stub root (migration/, model/, enum/) */
   stubDir?: string;

   /** Global “don’t write files” switch */
   noEmit?: boolean;

   /** Override default output folders */
   output?: {
      migrations?: string;
      models?: string;
      enums?: string;
   };

   /** Per-generator fine-tuning */
   migrate?: Partial<MigratorConfigOverride>;
   modeler?: Partial<ModelConfigOverride>;
}


/* --- Migrator-specific extra keys ---------------------------------------- */
export interface MigratorConfigOverride extends LaravelGeneratorConfig {
   /**
    * Custom migration rules:
    *  • string – path to JS module exporting Rule[]
    *  • Rule[] – rules array inline
    */
   rules?: string | Rule[];
   stubPath?: string;
   defaultMaps?: DefaultMaps
}


export interface ModelConfigOverride extends LaravelGeneratorConfig {
   modelStubPath?: string;
   enumStubPath?: string;
   /** Extra folder for enums (modeler only) */
   outputEnumDir?: string;
   /** use awobaz/compoships */
   awobaz?: boolean;
   /** Extra fields allowed on pivot models */
   allowedPivotExtraFields?: string[];
}
```

</details>

---

## 🛠️ Prisma Generator Setup (quick)

Even with the shared file you may still keep minimal blocks in `schema.prisma`:

```prisma
generator migrate {
  provider  = "prisma-laravel-migrations"
  stubDir   = "./prisma/stubs"
}

generator modeler {
  provider  = "prisma-laravel-models"
  stubDir   = "./prisma/stubs"
```

### Field Reference

| Key                    | Notes                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `outputDir / output`   | Destination folder (`outputDir` overrides `output`).                                                      |
| `outputEnumDir`        | (modeler) directory for generated enum classes.                                                           |
| `stubDir`              | Root stub folder (`migration/`, `model/`, `enum/`).                                                       |
| `tablePrefix`          | String prepended to every generated **physical** table name.                                              |
| `tableSuffix`          | String appended to every generated **physical** table name.                                               |
| `groups`               | JS module *or* inline array that maps stub files to table groups.                                         |
| `noEmit`               | If `true`, generator parses and validates but **does not write** any files (dry-run / CI mode).           |

---


## 🔀 `groups` – Stub Grouping (v2)

A **group** links one stub file to _many_ tables (or enums).  
From v2 you can keep the old **`tables: [...]`** list **or** use the new, more
expressive selectors:

| Key          | Type / Example                         | Meaning                                                      |
|--------------|----------------------------------------|--------------------------------------------------------------|
| `tables`     | `["users","accounts"]`                 | Classic explicit list – **exact names** only                 |
| `include`    | `["audit_*","logs"]` **or** `"*"`      | White‑list using globs or `'*'` (all)                       |
| `exclude`    | `["*_archive","failed_jobs"]`          | Black‑list applied *after* include / pattern                 |
| `pattern`    | `/^temp_/` or `"report_*"`             | `RegExp` **or** glob(s) – match if **any** hits              |

> Only one of **`tables`** **or** the new selector trio is required.

### Generator block

```prisma
generator migrate {
  provider = "prisma-laravel-migrations"
  stubDir  = "./prisma/stubs"
  groups   = "./prisma/group-stubs.js"
}
```

### `prisma/group-stubs.js`

```js
/** @type {import('prisma-laravel-migrate').FlexibleStubGroup[]} */
module.exports = [
  // 1. legacy explicit list
  {
    stubFile: "auth.stub",                // stubs/migration/auth.stub
    tables:   ["users","accounts","password_resets"]
  },

  // 2. regex + blacklist
  {
    stubFile: "audit.stub",
    pattern : /^audit_/,
    exclude : ["audit_archive"]
  },

  // 3. catch‑all
  {
    stubFile: "catch-all.stub",
    include : "*",
    exclude : ["failed_jobs","migrations"]
  }
];
```

### Resolution order

1. **Table‑specific** — `stubs/<type>/<table>.stub`  
2. **First matching group** (objects are checked top‑to‑bottom)  
3. **Default** — `stubs/<type>/index.stub`

> If a group’s `stubFile` does not exist it is skipped, so you may leave unused
> groups in place without breaking the build.

## 📁 Stub Folder Layout

```text
prisma/stubs/
├── migration/index.stub
├── model/index.stub
├── model/simple-model.stub
└── enum/index.stub
```

Add table‑specific overrides at  
`stubs/<type>/<table>.stub` (e.g. `stubs/model/users.stub`).

---

## 🔧 CLI Commands

| Command | Purpose |
| --- | --- |
| `init` | Inject generator blocks & scaffold stub folders |
| `customize` | Create per-table stub overrides |
| `gen` | Run `prisma generate` then Laravel generators |

### init

```bash
npx prisma-laravel-cli init --schema=prisma/schema.prisma
```

### customize

```bash
npx prisma-laravel-cli customize   -t migration,model   -n users,accounts   --force
```

| Flag | Description |
| --- | --- |
| `-t, --type` | **Required.** Stub types (`migration`, `model`, `enum`). `enum` may not mix. |
| `-n, --names` | **Required.** Table or enum names (`users,accounts`). |
| `--force` | Overwrite existing stub files. |
| `--config` | Alternate CLI config path. |

### gen

```bash
npx prisma-laravel-cli gen --config=prisma/laravel.config.js
# skip prisma generate step
npx prisma-laravel-cli gen --config=prisma/laravel.config.js --skipGenerate
```

`prisma/laravel.config.js`

```js
module.exports = {
  migrator: {
    outputDir: "database/migrations",
    stubDir:   "prisma/stubs",
    groups:    "./prisma/group-stubs.js"
  },
  modeler: {
    outputDir:     "app/Models",
    outputEnumDir: "app/Enums",
    stubDir:       "prisma/stubs",
    groups:        "./prisma/group-stubs.js"
  }
};
```

---

## 🔄 How updates are applied

1. Generator builds a **full new file** from your schema & stubs.
2. Performs a **git‑style 3‑way merge** (using `node-diff3`):
  - **base** = last generator output (`.prisma-laravel/backups/...`)
  - **ours** = file on disk (user edits)
  - **theirs** = freshly generated file
3. Non‑conflicting changes merge automatically; conflicts are wrapped with  
  `<<<<<<<`, `=======`, `>>>>>>>`.
4. New `use …;` imports are merged, duplicates skipped.
5. Baseline copy is updated in the backups folder.

Delete the marker block **and** set `noEmit = true` to stop updates for a file.

---

## ✨ Stub Customisation Notes

Stubs are **JavaScript template literals**. Escape \` and \${ } if you want them literally.

> **Fully custom model stubs**  
> If you remove the `${content}` placeholder **and** the marker block, the
> generator leaves the file untouched.  
> Keep the markers if you want automated updates but customised surroundings.

---

## 📑 Default Stub Templates

<details>
<summary>Enum <code>index.stub</code></summary>

```php
<?php

namespace App\\Enums;

enum ${enumDef.name}: string
{
${enumDef.values.map(v => `    case ${v} = '${v}';`).join('\\n')}
}
```

</details>

<details>
<summary>Migration <code>index.stub</code></summary>

```php
<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('${tableName}', function (Blueprint $table) {
            ${columns}
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('${tableName}');
    }
};
```

</details>

---

## 🏗️ Complex Model Stub Example

<details>
<summary>Expand stub</summary>

```php
<?php

namespace App\\Models;

${model.imports}
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\{ BelongsTo, HasMany, BelongsToMany };

class ${model.className} extends Model
{
    protected $table = '${model.tableName}';

    /* Mass Assignment */
    protected $fillable = [
${model.properties.filter(p => p.fillable).map(p => `        '${p.name}',`).join('\\n')}
    ];
    protected $guarded = [
${(model.guarded ?? []).map(n => `        '${n}',`).join('\\n')}
    ];

    /* Hidden & Casts */
    protected $hidden = [
${model.properties.filter(p => p.hidden).map(p => `        '${p.name}',`).join('\\n')}
    ];
    protected $casts = [
${model.properties.filter(p => p.cast).map(p => `        '${p.name}' => '${p.cast}',`).join('\\n')}
${model.properties.filter(p => p.enumRef).map(p => `        '${p.name}' => ${p.enumRef}::class,`).join('\\n')}
    ];

    /* Interfaces metadata */
    public array $interfaces = [
${Object.entries(model.interfaces).map(([k,i]) =>
`        '${k}' => {${i.import ? ` import: '${i.import}',` : ''} type: '${i.type}' },`).join('\\n')}
    ];
    // This structure is useful for packages like fumeapp/modeltyper which
    // read interface metadata to build TypeScript helpers.

    /* Relationships */
${model.relations.map(r => {
  const args = [r.modelClass, r.foreignKey ? `'${r.foreignKey}'` : '', r.localKey ? `'${r.localKey}'` : ''].filter(Boolean).join(', ');
  return `    public function ${r.name}(): ${r.type.charAt(0).toUpperCase()+r.type.slice(1)}\\n    {\\n        return $this->${r.type}(${args});\\n    }`;
}).join('\\n\\n')}
// Or 
${relationships}

    ${content}
}
```

</details>

---

## 🚀 Enum Casting

```php
protected $casts = [
    'status' => StatusEnum::class,
];
```

---


## 🧩 Custom Migration Rules

Point the generator’s `rules` field to a JS file exporting an **array** of
objects that implement the `Rule` interface:

```prisma
generator migrate {
  provider = "prisma-laravel-migrations"
  stubDir  = "./prisma/stubs"
  rules    = "./prisma/custom-rules.js"
}
```

`prisma/custom-rules.js`

```js
/** @type {import('prisma-laravel-migrate').Rule[]} */
module.exports = [
  {
    // Always add an `archived` boolean column defaulting to false
    test(def) {
      return def.name === "archived" && def.migrationType === "boolean";
    },
    render() {
      return {
        column: "archived",
        snippet: ["$table->boolean('archived')->default(false);"],
      };
    },
  },
  // add more Rule objects...
];
```

**Rule execution order**

1. Built‑in rules  
2. Custom rules (executed in array order)

---

### ColumnDefinition quick reference

`ColumnDefinition` extends Prisma’s `DMMF.Field`, so all raw Prisma
properties remain accessible.

```ts
import { DMMF } from "@prisma/generator-helper";

export interface ColumnDefinition extends DMMF.Field {
  migrationType: MigrationType; // e.g. "unsignedBigInteger"
  args?: string[];
  nullable?: boolean;
  unsigned?: boolean;

  hasDefaultValue: boolean;
  default?: string | number | boolean | null;

  relationship?: {
    on: string;
    references?: string[];
    fields: string[]
    onDelete?: string;
    onUpdate?: string;
  };

  ignore?: boolean;
}
```

Common checks inside a rule:

```ts
def.kind          // "scalar" | "enum" | "object"
def.type          // original Prisma scalar
def.migrationType // mapped Laravel builder name
def.isId
```

📝 **Prisma DMMF docs:**  
https://github.com/prisma/prisma/blob/main/packages/prisma-schema-wasm/src/__tests__/snapshot/dmmf.md


---

# Comment Directives for `schema.prisma` (Prisma → Laravel)

These inline **comment directives** let you shape what the generators emit from your Prisma schema — without changing runtime schema semantics.

You can attach them either:

* **Per–field** (inline or `///` directly above the field), or
* **Per–model/enum** (any `///` inside the model/enum’s block).

> This document focuses on the **new & updated directives** and how they interact with existing ones like `@fillable`, `@hidden`, `@guarded`, `@cast{…}`, `@type{…}`, `@with`, `@trait:…`, `@extend:…`, `@implements:…`, `@observer:…`, `@factory:…`, `@touch{…}`, `@appends{…}`.

---

## What’s New

* **`@local`** — *replaces* the prior `@ignore` directive. Skips generating a single **relation method** on a model. Supports **scoped arguments**.
* **`@silent`** — marks an entire **model or enum** to be parsed but **not emitted** (no model file, no migration, no enum class). Supports **scoped arguments**.
* **`@morph(...)`** — declares **owner-side polymorphic relations** (`morphOne`, `morphMany`, `morphToMany`, `morphedByMany`) with optional chained calls. Child-side `morphTo` remains **auto-detected** from scalar pairs like `commentable_id` + `commentable_type`.

---

## Summary of Directives

| Directive                                                                                   | Scope                                   | Purpose                                                                                  |
| ------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `@fillable`                                                                                 | Field **or** `@fillable{…}` on model    | Adds field(s) to `$fillable`.                                                            |
| `@hidden`                                                                                   | Field **or** `@hidden{…}` on model      | Adds field(s) to `$hidden`.                                                              |
| `@guarded`                                                                                  | Field **or** `@guarded{…}` on model     | Adds field(s) to `$guarded`.                                                             |
| `@cast{…}`                                                                                  | Field                                   | Adds a cast entry to `$casts`.                                                           |
| `@type{ import:'…', type:'…' }`                                                             | Field                                   | Exposes a PHP/interface type hint for downstream tooling.                                |
| `@with` / `@with(a,b,…)`                                                                    | Field / Model                           | Marks relations to eager-load via `$with`.                                               |
| `@trait:…` `@extend:…` `@implements:…` `@observer:…` `@factory:…` `@touch{…}` `@appends{…}` | Model                                   | Class customization & extras (traits, parents, observers, factories, touches, appends).  |
| `@local`                                                                                    | Relation Field                          | Skip generating that **specific relation method** on the model. Replaces `@ignore`.      |
| `@silent`                                                                                   | Model / Enum                            | Do **not** emit files for this entity (model + migration / enum).                        |
| `@morph(…)`                                                                                 | Model                                   | Declare owner-side polymorphic relations; child-side `morphTo` is auto-detected.         |
| `@pivot` / `@pivot(a,b,…)`                                                                  | Pivot **model** and/or scalar **fields**| Explicitly mark extra pivot columns to include in generated `withPivot(…)` chains.       |
| `@withTimestamps`                                                                           | Pivot **model** / relation **field**    | Instructs the generator to append `->withTimestamps()` on the relation definition.       |
| `@pivotAlias(name)`                                                                         | Pivot **model**                         | Sets the pivot attribute alias; generator should add `->as('name')` on the relation.     |

> **Syntax options**
> • Inline: `balance Decimal /// @fillable @cast{decimal:2}`
> • Block above field: `/// @hidden`
> • Model list: `/// @fillable{name,balance}`
> • Model eager‑load: `/// @with(posts,roles)`
> • **Traits / implements**:
> `/// @trait:Illuminate\Auth\Authenticatable`
> `/// @implements:Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract`
> • **Observers / factory**:
> `/// @observer:App\Observers\UserObserver`
> `/// @factory:UserFactory`
> • **Touches / appends**:
> `/// @touch{company,profile}`
> `/// @appends{full_name,age}`

> **Note:** Directives like `@fillable`, `@hidden`, `@guarded`, `@with`, `@touch`, and `@appends` now support **all of the following syntaxes**:
> - `/// @fillable{name,balance}`  
> - `/// @fillable(name,balance)`  
> - `/// @fillable: name,balance`
---

## `@local` — Skip a Single Relation Method (replaces `@ignore`)

Use `@local` on a **relation field** to prevent generating that one PHP relation method in the model class.

**Forms:**

* `@local` → **both Model + Migrator**
* `@local(model)` → Model only
* `@local(migrator)` or `@local(migration)` → Migrator only
* `@local(both)` / `@local(all)` / `@local(*)` → Both
* `@local(model,migrator)` → Both

```prisma
model Account {
  id     Int   @id @default(autoincrement())
  user   User? @relation(fields: [userId], references: [id]) /// @local
  userId Int?
}
```

**Effect:** the `user()` method is *not* written to `Account.php`. If scope includes Migrator, the migration also skips generating the FK/constraint. Other methods remain unaffected.

---

## `@silent` — Ignore a Whole Model or Enum at Emission Time

Apply `/// @silent` inside a **model or enum** docblock to mark it as **non-emitting**.

**Forms:**

* `@silent` → **both Model + Migrator**
* `@silent(model)` → suppress only the model file
* `@silent(migrator)` / `@silent(migration)` → suppress only the migration
* `@silent(both)` / `@silent(all)` / `@silent(*)` → suppress both
* `@silent(model,migrator)` → suppress both

```prisma
/// @silent
model AuditTrail {
  id   Int @id @default(autoincrement())
  note String
}
```

**Effect:** no Eloquent model and/or no migration file are emitted for `AuditTrail` depending on the scope. For enums, no PHP enum is emitted.

---


## Polymorphic Relations

### Auto-Detected Child Side: `morphTo`

If a model contains **scalar** columns named `<base>_id` and `<base>_type` — for example `commentable_id` and `commentable_type` — the generator emits the child-side method automatically:

```php
public function commentable()
{
    return $this->morphTo('commentable');
}
```

No directive is required for `morphTo`.

### Owner Side via `@morph(…)`

Add one or more `@morph(...)` directives to the **owner model’s** docblock to generate Laravel morph methods. Parentheses and quotes inside `raw:"…"` are supported.

**Parameters**

* `name:` the morph **base**; supplies the string argument in Laravel calls and corresponds to the `*_id` / `*_type` pair on the child.
* `type:` one of:

  * `one` → `morphOne`
  * `many` → `morphMany`
  * `to many` → `morphToMany`
  * `by many` → `morphedByMany`
* `model:` target Eloquent model (class *short* name).

**Optional**

* `table:` pivot table for `morphToMany` / `morphedByMany`.
* `raw:` chained expression appended to the relation, e.g. `raw:"latest()->where('active',1)"`.
* `as:` method name override (defaults derive from `model`; pluralized for “many” types).
* `idField:` / `typeField:` to override the default `<base>_id` / `<base>_type` column names on the child.

**Examples**

```prisma
/// Owner: Post → morphMany(Comment::class, 'commentable') + chain
/// @morph(name: commentable, type: many, model: Comment, raw:"latest()", as: comments)
model Post {
  id    Int   @id @default(autoincrement())
  title String
}

/// Owner: User → morphOne(Image::class, 'imageable')
/// @morph(name: imageable, type: one, model: Image, as: avatar)
model User {
  id   Int   @id @default(autoincrement())
  name String
}

/// Owner: Video → morphToMany(Tag::class, 'taggable', 'taggables')
/// @morph(name: taggable, type: to many, model: Tag, table:"taggables")
model Video {
  id   Int   @id @default(autoincrement())
  url  String
}
```

**Generated (sketch):**

```php
public function comments() { return $this->morphMany(Comment::class, 'commentable')->latest(); }
public function avatar()   { return $this->morphOne(Image::class, 'imageable'); }
public function tags()     { return $this->morphToMany(Tag::class, 'taggable', 'taggables'); }
```

---

## Additional Polymorphic Examples for Testing

**A) morphMany + child morphTo**

```prisma
/// @morph(name: commentable, type: many, model: Comment, raw:"latest()")
model Post {
  id    Int     @id @default(autoincrement())
  title String
}

model Comment {
  id               Int     @id @default(autoincrement())
  body             String
  commentable_id   Int
  commentable_type String
}
```

**B) morphOne + child morphTo**

```prisma
/// @morph(name: imageable, type: one, model: Image, as: avatar)
model User {
  id   Int    @id @default(autoincrement())
  name String
}

model Image {
  id              Int     @id @default(autoincrement())
  path            String
  imageable_id    Int
  imageable_type  String
}
```

**C) Polymorphic M\:N (`morphToMany` / `morphedByMany`)**

```prisma
/// @morph(name: taggable, type: to many, model: Tag, table: "taggables")
model Post {
  id    Int    @id @default(autoincrement())
  title String
}

/// @morph(name: taggable, type: to many, model: Tag, table: "taggables")
model Video {
  id    Int    @id @default(autoincrement())
  title String
  url   String
}

/// @morph(name: taggable, type: by many, model: Post, table: "taggables")
/// @morph(name: taggable, type: by many, model: Video, table: "taggables")
model Tag {
  id   Int    @id @default(autoincrement())
  name String @unique
}

// Optional explicit pivot table for integrity (Prisma treats polymorphic targets as scalars)
model Taggable {
  id             Int    @id @default(autoincrement())
  tag_id         Int
  taggable_id    Int
  taggable_type  String

  tag Tag @relation(fields: [tag_id], references: [id])

  @@index([taggable_type, taggable_id])
  @@map("taggables")
}
```

**D) Unconventional base name (`actor`)**

```prisma
/// @morph(name: actor, type: many, model: Activity, as: activities)
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
}

model Activity {
  id         Int     @id @default(autoincrement())
  action     String
  actor_id   Int
  actor_type String
}
```

  

#### Other Examples

  

```prisma

/// @fillable{name,balance}
/// @hidden{secretToken}
model Account {
  id        Int      @id @default(autoincrement())
  balance   Decimal  @default(0.0) /// @cast{decimal:2}
  nickname  String   /// @fillable @hidden
  profile   Json?    /// @type{ import:'@types/forms', type:'ProfileDTO' }
  company   Company? @relation(fields:[companyId], references:[id]) /// @local

  companyId Int?
  posts     Post[]   /// @with
}

  

/// @with(posts,comments)

model User {
  id       Int      @id @default(autoincrement())
  email    String
  posts    Post[]
  comments Comment[]
}

```

**Generated output**

```php

protected $fillable = ['name','balance','nickname'];
protected $hidden   = ['secretToken','nickname'];
protected $casts    = ['balance' => 'decimal:2'];

public array $interfaces = [
    'profile' => { import: '@types/forms', type: 'ProfileDTO' },
];

protected $with = ['posts'];

```

`@local` prevents the `company()` relation method.  

Combine multiple inline directives; they’re processed left‑to‑right.

#### Example: Combined Directives

```prisma

/// @fillable{name,balance}
/// @hidden{secretToken}
/// @guarded{password,apiToken}
/// @trait:Illuminate\Auth\Authenticatable
/// @extend:Illuminate\Auth\User
/// @implements:Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract
/// @observer:App\Observers\UserObserver
/// @factory:UserFactory
/// @touch{company}
/// @appends{full_name}
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique                      /// @hidden @fillable
  password  String                                 /// @hidden @guarded
  balance   Decimal @default(0.0) /// @cast{decimal:2}
  profile   Json?    /// @type{ import:'@types/forms', type:'ProfileDTO' }
  company   Company? @relation(fields:[companyId], references:[id]) /// @local
  companyId Int?
  posts     Post[]   /// @with
}

```

**Generated output (simplified)**

```php

use Illuminate\Auth\Authenticatable;
use Illuminate\Auth\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use App\Observers\UserObserver;

class User extends User implements AuthenticatableContract
{
    use HasFactory, Authenticatable;
    
    protected $fillable = ['name','balance','email'];
    protected $hidden   = ['secretToken','password'];
    protected $guarded  = ['password','apiToken'];
    protected $casts    = ['balance' => 'decimal:2'];
    protected $touches  = ['company'];
    protected $appends  = ['full_name'];
    protected static string $factory = UserFactory::class;

    protected static function boot()
    {
        parent::boot();
        static::observe(UserObserver::class);
    }

    public function getFullNameAttribute()
    {
        return $this->attributes['full_name'] ?? null;
    }

    public function posts()
    {
        return $this->hasMany(Post::class);
    }
}
```

---
## Notes & Limitations

* `@local` is **model-method only**; it does not change the migration. Use `@silent` to suppress a whole model/enum from emission.
* Laravel cannot express **composite pivot keys** directly inside `belongsToMany(...)`. If your schema uses composite pivot keys, consider generating a Pivot model or using query/Compoships patterns on the one-to-many sides.
* The generator keeps your edits safe via merge markers; conflicts will be surfaced with `<<<<<<<` sections for manual resolution.
---

## 💡 Tips

- Combine `migration` & `model` in one customize command when table names align.
- Use `noEmit: true` for dry‑runs or CI validation.
- Escape template chars in stub files.

---

## 📚 Programmatic API (ES / TypeScript)

Use the library directly in a script or build tool instead of the CLI.

```ts
import {
  generateLaravelSchema,
  generateLaravelModels,
  sortMigrations,
} from 'prisma-laravel-migrate';
import { readFileSync, writeFileSync } from 'fs';
import { getDMMF } from '@prisma/sdk';

(async () => {
  /* 1. Load schema & build DMMF */
  const schemaPath = 'prisma/schema.prisma';
  const datamodel  = readFileSync(schemaPath, 'utf8');
  const dmmf       = await getDMMF({ datamodel });

  /* 2. Run generators entirely in-memory */
  const migrations = generateLaravelSchema({
    dmmf,
    schemaPath,                 // ← always pass this
    generator : { config: {} } as any,
  });

  const { models, enums } = generateLaravelModels({
    dmmf,
    schemaPath,
    generator : { config: {} } as any,
  });

  /* 3. Inspect or write output */
  sortMigrations(migrations).forEach(m => {
    writeFileSync(`./out/${m.tableName}.php`, m.statements.join('\n'), 'utf8');
  });
})();
```

### Custom migration rules in code

```ts
import { Rule } from 'prisma-laravel-migrate';

const softDeleteRule: Rule = {
  test:   d => d.name === 'deleted_at' && d.migrationType === 'timestamp',
  render: () => ({
    column : 'deleted_at',
    snippet: ["$table->timestamp('deleted_at')->nullable();"],
  }),
};

generateLaravelSchema({
  dmmf,
  schemaPath: 'prisma/schema.prisma',
  generator : { config: { rules: [softDeleteRule] } } as any,
});
```

### Public exports

| Export                           | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `generateLaravelSchema`          | Build migration objects (and optionally write files)|
| `generateLaravelModels`          | Build model + enum definitions                      |
| `sortMigrations`                 | Topologically sort migrations by FK dependencies    |
| `Rule`                           | Type helper for custom migration shortcuts          |
| _types_ (`column-definition-types`, `laravel-config`) | Full TypeScript typings          |

```ts
import {
  ColumnDefinition,
  LaravelSharedConfig,
  MigratorConfigOverride,
} from 'prisma-laravel-migrate';
```

> **Heads-up:**  
> `generateLaravelSchema` and `generateLaravelModels` **write files by default**  
> (honouring the `outputDir` settings).  
> If you only want the in-memory objects—e.g. to capture the returned
> `migrations`, `models`, or `enums` arrays—set  
> `noEmit: true` in either
>
> * the per-call `generator.config` object:
>   ```ts
>   generateLaravelSchema({
>     dmmf,
>     schemaPath,
>     generator: { config: { noEmit: true } } as any,
>   });
>   ```
> * **or** in `prisma/laravel.config.js`:
>   ```js
>   module.exports = {
>     migrate: { noEmit: true },
>     modeler: { noEmit: true },
>   };
>   ```
> This prevents any files from being created or overwritten while still
> returning the fully-populated data structures for custom processing.

---


# Prisma → Laravel Migration Guide

This document explains **how `prisma‑laravel‑migrate` converts your Prisma schema into
Laravel migration code**, so you can model your database in Prisma while still getting
clean, idiomatic Laravel migrations.

---

## 1. Scalar → Migration type map

The generator first turns every Prisma (or native) scalar into the
corresponding **Laravel schema builder method**.

| Native type | Laravel method |
|-------------|----------------|
| `Text` | `text()` |
| `VarChar` | `string()` |
| `Boolean` | `boolean()` |
| `TinyInt` | `tinyInteger()` |
| `UnsignedBigInt` | `unsignedBigInteger()` |
| `BigInt` | `bigInteger()` |
| `Decimal` | `decimal()` |
| `Double` | `double()` |
| `DateTime` | `timestamp()` |
| `Timestamptz` | `timestampsTz()` |
| `Json` | `json()` |
| `Uuid` | `uuid()` |
| `Inet` | `ipAddress()` |

*(See source `migrationTypes.ts` for the full mapping.)*

---

## 2. Automatic shorthand rules

After basic mapping, each column is checked against a **rule set**
so that common Laravel helper methods are used instead of verbose definitions.

| Rule | Condition in Prisma | Generated code |
|------|--------------------|----------------|
| **Primary ID** | `id BigInt @id @default(autoincrement())` | `$table->id();` |
| **Timestamps** | `created_at / updated_at` pair (`DateTime` or `Timestamp`) | `$table->timestamps();` |
| **TimestampsTz** | Same pair but `DateTimeTz` / tz‑aware types | `$table->timestampsTz();` |
| **Soft‑deletes** | `deleted_at DateTime` | `$table->softDeletes();` |
| **Soft‑deletesTz** | `deleted_at DateTimeTz` | `$table->softDeletesTz();` |
| **Remember token** | `remember_token String?` | `$table->rememberToken();` |
| **`foreignId`** | `<col>_id` + `@relation(...)` | `$table->foreignId('…')->constrained();` |
| **Morphs / NullableMorphs** | `<base>_id` & `<base>_type` combo | `$table->morphs('base');` / `$table->nullableMorphs('base');` |
| **UUID / ULID Morphs** | Same but with `Uuid` / `Ulid` id column | `$table->uuidMorphs()` & friends |

If a rule fires, both columns involved are marked *ignored* so the fallback
builder doesn't emit them twice.

---

## 3. Fallback builder

Anything that doesn't match a rule is rendered with:

```php
$table->{method}('{name}', ...args)
      ->nullable()      // if applicable
      ->unsigned()      // if applicable
      ->default(...)    // if applicable
      ->comment('…');   // if present
```

Foreign‑key references (`@relation`) then add a separate `$table->foreign()` chain.

---

## 4. Example

### Prisma model

```prisma
model Post {
  id          Int      @id @default(autoincrement())       // ➜ $table->id()
  title       String                                         
  body        Text
  author_id   Int
  author      User     @relation(fields:[author_id], references:[id])
  remember_token String?  // ➜ rememberToken
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?
}
```

### Generated migration excerpt

```php
$table->id();
$table->string('title');
$table->text('body');
$table->foreignId('author_id')->constrained('users', 'id');
$table->rememberToken();
$table->timestamps();
$table->softDeletes();
```

---

## 5. Customising

* **Native type hints** – use `@db.VarChar(191)` etc. Prisma passes the native type,
  the generator maps it to the proper Laravel builder.
* **Override or extend** – supply your own `rules` array in `schema.prisma` to replace
  or add to the built‑in ones.
* **Stub files** – tweak the surrounding PHP (imports, namespace, etc.) by editing
  `prisma/stubs/migration/index.stub` or create per‑table stubs.

---

## 6. Gotchas

* **Make columns nullable** in Prisma if you expect `->nullable()` in Laravel.
* The generator relies on conventional column names (`*_id`, `created_at`, …)
  for shortcut rules; non‑standard names fall back to the generic builder.
* Remember to run migrations **after** generating to ensure FK order is correct
  (the tool topologically sorts tables to avoid dependency loops).
---
### Custom `defaultMaps` for `formatDefault`

You can override the built‑in `formatDefault()` logic without forking the package by
passing a **`defaultMaps`** object in your generator (or shared) config.

```js
// prisma/laravel.config.js
module.exports = {
  migrate: {
    // …
  },
  modeler: {
    // …
  },

  /* 👇 NEW: map Prisma default names → your own formatter */
  defaultMaps: {
    uuid(field) {
      // e.g. MSSQL `NEWID()`
      return "->default(DB::raw('NEWID()'))";
    },
    cuid(field) {
      // Use a DB function from a custom extension
      return "->default(DB::raw('gen_cuid()'))";
    },
    // Fallback for any unmapped default remains the package default.
  },
};
```

**How it works**

1. If `defaultMaps[name]` exists, it is called with the current `DMMF.Field`.
2. If the function returns a string, that string is appended directly to the
   column definition.
3. If the function returns `null`/`undefined`, the generator falls back to the
   built‑in behaviour.
4. Keys are matched *case‑sensitive* to the Prisma default function
   (`uuid`, `cuid`, `sequence`, etc.).

> **Reference** – full list of Prisma `@@default()` helpers  
> <https://www.prisma.io/docs/orm/reference/prisma-schema-reference#default>
---
Happy scaffolding! 🎉


---

## 📜 License

MIT — Happy scaffolding! 🎉