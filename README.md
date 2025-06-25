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

## 🛠️ Prisma Generator Setup

Add both generator blocks to **`schema.prisma`**:

```prisma
generator migrate {
  provider  = "prisma-laravel-migrate"
  stubDir   = "./prisma/stubs"

  output    = "database/migrations"   // fallback
  outputDir = "database/migrations"   // takes precedence

  noEmit    = false                   // skip writing if true
  groups    = "./prisma/group-stubs.js"
}

generator modeler {
  provider      = "prisma-laravel-models"
  stubDir       = "./prisma/stubs"

  output        = "app/Models"
  outputDir     = "app/Models"        // overrides output
  outputEnumDir = "app/Enums"

  noEmit        = false
  groups        = "./prisma/group-stubs.js"
}
```

### Field Reference

| Key | Notes |
| --- | --- |
| `outputDir / output` | Destination folder (`outputDir` overrides `output`). |
| `outputEnumDir` | (modeler) directory for generated enum classes. |
| `stubDir` | Root stub folder (`migration/`, `model/`, `enum/`). |
| `groups` | JS module that maps stub files to table groups. |
| `noEmit` | If `true`, generator parses but **writes no** files (dry‑run). |

---

## 🔀 `groups` – Stub Grouping

```prisma
generator migrate {
  provider = "prisma-laravel-migrate"
  stubDir  = "./prisma/stubs"
  groups   = "./prisma/group-stubs.js"
}
```

`prisma/group-stubs.js`

```js
module.exports = [
  {
    stubFile: "auth.stub",                // stubs/migration/auth.stub
    tables:   ["users","accounts","password_resets"]
  },
  {
    stubFile: "billing.stub",             // stubs/migration/billing.stub
    tables:   ["invoices","transactions"]
  }
];
```

**Resolution order**

1. `stubs/<type>/<table>.stub` (table‑specific)
2. Matching group stub (`stubFile`)
3. `stubs/<type>/index.stub` (default)

---

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
    // <prisma-laravel:start>
${enumDef.values.map(v => `    case ${v} = '${v}';`).join('\\n')}
    // <prisma-laravel:end>
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
            // <prisma-laravel:start>
            ${columns}
            // <prisma-laravel:end>
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

    // <prisma-laravel:start>
    ${content}
    // <prisma-laravel:end>
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
  provider = "prisma-laravel-migration"
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
    references?: string;
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

### 📝 Comment-Directives in `schema.prisma`

Attach these `@` directives either to a **field** (inline or `///` above) **or**
to the **model** (curly‑brace syntax) to control what the generator writes into
your Eloquent model.

| Directive | Where you can put it | Effect in generated PHP |
| --- | --- | --- |
| `@fillable` | Field **or** `@fillable{...}` on model | Adds column(s) to `$fillable` |
| `@hidden` | Field **or** `@hidden{...}` on model | Adds column(s) to `$hidden` |
| `@guarded` | Field **or** `@guarded{...}` on model | Adds column(s) to `$guarded` |
| `@cast{...}` | Field only | Adds custom entry to `$casts` |
| `@type{ import:'…', type:'…' }` | Field only | Adds entry to `$interfaces` metadata |
| `@ignore` | Relation field | Skips generating the relationship method |
| `@with` (no args) | Relation field | Adds that single relation to `$with` |
| `@with(rel1,rel2,…)` | Model only | Adds listed relations to `$with` |

> **Syntax options**  
> • Inline:  
>  `balance Decimal /// @fillable @cast{decimal:2}`  
> • Block above field:  
>  `/// @hidden`  
> • Model list:  
>  `/// @fillable{name,balance}`  
> • Model eager‑load:  
>  `/// @with(posts,roles)`

---

#### Example

```prisma
/// @fillable{name,balance}
/// @hidden{secretToken}
model Account {
  id        Int      @id @default(autoincrement())

  balance   Decimal  @default(0.0) /// @cast{decimal:2}

  nickname  String   /// @fillable @hidden

  profile   Json?    /// @type{ import:'@types/forms', type:'ProfileDTO' }

  company   Company? @relation(fields:[companyId], references:[id]) /// @ignore
  companyId Int?

  posts     Post[]   /// @with
}

/// @with(posts,comments)
model User {
  id       Int      @id @default(autoincrement())
  email    String
  posts    Post[]
  comments Comment[]
}
```

**Generated output**

```php
protected $fillable = ['name','balance','nickname'];
protected $hidden   = ['secretToken','nickname'];
protected $casts    = ['balance' => 'decimal:2'];

public array $interfaces = [
    'profile' => { import: '@types/forms', type: 'ProfileDTO' },
];

protected $with = ['posts','comments'];
```

`@ignore` prevents the `company()` relation method.  
Combine multiple inline directives; they’re processed left‑to‑right.

---

## 💡 Tips

- Combine `migration` & `model` in one customize command when table names align.
- Use `noEmit: true` for dry‑runs or CI validation.
- Escape template chars in stub files.

---

## 📜 License

MIT — Happy scaffolding! 🎉