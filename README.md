# Prisma Laravel Migrate

A generator plugin that translates your **Prisma schema** into Laravel‑ready  
**Database Migrations**, **Eloquent Models**, and **Enum classes**.  
Built in strict TypeScript with fully‑customisable stubs, grouping, and marker‑based updates.

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
  provider    = "prisma-laravel-migrate"
  stubDir     = "./prisma/stubs"
  output      = "database/migrations"     // fallback
  outputDir   = "database/migrations"     // takes precedence
  startMarker = "// <prisma-laravel:start>"
  endMarker   = "// <prisma-laravel:end>"
  noEmit      = false
  groups      = "./prisma/group-stubs.js"
}

generator modeler {
  provider      = "prisma-laravel-models"
  stubDir       = "./prisma/stubs"
  output        = "app/Models"
  outputDir     = "app/Models"            // overrides output
  outputEnumDir = "app/Enums"
  startMarker   = "// <prisma-laravel:start>"
  endMarker     = "// <prisma-laravel:end>"
  noEmit        = false
  groups        = "./prisma/group-stubs.js"
}
```

### Field Reference

| Key | Notes |
| --- | --- |
| `outputDir / output` | Destination folder (`outputDir` takes precedence). |
| `outputEnumDir` | (modeler) directory for PHP enum classes. |
| `stubDir` | Root stubs folder (`migration/`, `model/`, `enum/`). |
| `startMarker/endMarker` | Region markers the generator will update. |
| `groups` | JS module exporting stub‑group mappings. |
| `noEmit` | If `true`, generator parses but **writes no** files. |

---


### 🔀 `groups` – Stub Grouping

Use **`groups`** in the generator block to map multiple tables (or enums)
to a shared stub template:

```prisma
generator migrate {
  provider = "prisma-laravel-migrate"
  stubDir  = "./prisma/stubs"
  groups   = "./prisma/group-stubs.js"
}
```

`prisma/group-stubs.js`

```js
/**
 * Each object links one stub file (relative to stubDir/<type>/)
 * to an array of tables (or enums) that should use it.
 */
module.exports = [
  {
    // Auth domain
    stubFile: "auth.stub",          // stubs/migration/auth.stub
    tables: ["users", "accounts", "password_resets"]
  },
  {
    // Billing domain
    stubFile: "billing.stub",       // stubs/migration/billing.stub
    tables: ["invoices", "transactions"]
  }
];
```

**Resolution order**

1. `stubs/<type>/<table>.stub` (table‑specific)
2. Matching group stub (`stubFile`)
3. `stubs/<type>/index.stub` (default)


---

## 📁 Stub Folder Layout

```
prisma/stubs/
├── migration/index.stub
├── model/index.stub
├── model/simple-model.stub
└── enum/index.stub
```

Create a table‑specific override with  
`stubs/<type>/<table>.stub` (e.g. `stubs/model/users.stub`).

---

## 🔧 CLI Commands

| Command | What it does |
| --- | --- |
| `init` | Inject generator blocks & scaffold stub folders |
| `customize` | Create per‑table stub overrides |
| `gen` | Run `prisma generate` then Laravel generators |

### init

```bash
npx prisma-laravel-cli init --schema=prisma/schema.prisma
```

### customize

Generate override stubs.

```bash
npx prisma-laravel-cli customize \
  -t <types> \
  -n <names> \
  [--force] \
  [--config <path>]
```

| Flag | Description |
| --- | --- |
| `-t, --type` | **Required.** Comma‑separated list of stub types.<br>Valid values: `migration`, `model`, `enum`. You may combine `migration,model`; `enum` must be used alone. |
| `-n, --names` | **Required.** Comma‑separated table or enum names (e.g. `users,accounts`). |
| `--force` | Overwrite existing stub files. |
| `--config` | Path to an alternate CLI config file (custom stubDir/groups). |

**Behaviour**

1. Checks `<stubDir>/<type>/<name>.stub`.
2. If missing, copies from `index.stub` → that path and logs:  
  `➡️ Created stubs/<type>/<name>.stub from index.stub`
3. If present and `--force` **not** set:  
  `⏭️ Skipped existing stubs/<type>/<name>.stub`
4. With `--force`, overwrites and logs creation.

**Example**

```bash
# migration + model overrides for two tables
npx prisma-laravel-cli customize -t migration,model -n users,accounts
```

### gen

```bash
# run prisma generate then Laravel generators
npx prisma-laravel-cli gen --config=prisma/laravel.config.js

# skip prisma generate step
npx prisma-laravel-cli gen --config=prisma/laravel.config.js --skipGenerate
```

`prisma/laravel.config.js` example:

```js
module.exports = {
  migrator: {
    outputDir: "database/migrations",
    stubDir: "prisma/stubs",
    groups: "./prisma/group-stubs.js",
  },
  modeler: {
    outputDir: "app/Models",
    outputEnumDir: "app/Enums",
    stubDir: "prisma/stubs",
    groups: "./prisma/group-stubs.js",
  },
};
```

---

## ✨ Stub Customization Notes

Stubs are **JS template literals**. Escape \\` and \\${ } if you want them literally.

> **Full custom model stubs**  
> If you plan to hand-craft **all** the internal sections yourself
> (fillable, hidden, casts, etc.), remove the `${content}` placeholder
> but **keep** the `// <prisma-laravel:start>` and
> `// <prisma-laravel:end>` markers so the generator still knows where
> to inject future updates.  
> Remove the markers only if you never want the file touched again

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

## 💡 Tips

- Combine `migration` & `model` in one customize command when table names align.
- Use `noEmit: true` for dry‑runs or CI validation.
- Escape template chars in stub files.

---

## 📜 License

MIT — Happy scaffolding! 🎉