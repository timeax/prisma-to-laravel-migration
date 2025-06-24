# Prisma Laravel Migrate

A generator toolkit that translates your **Prisma schema** into Laravel-compatible  
**Database Migrations**, **Eloquent Models**, and **Enum classes**.  
Everything is written in strict TypeScript and fully customizable through stubs, grouping, and marker-based injection.

---

## 📦 Installation

```bash
npm install prisma-laravel-migrate --save-dev

(Requires prisma in the same project.)


---

🛠️ Prisma Generator Setup

Insert two generator blocks in schema.prisma:

generator migrate {
  provider    = "prisma-laravel-migrate"
  stubDir     = "./prisma/stubs"
  output      = "database/migrations"   // fallback
  outputDir   = "database/migrations"   // takes precedence
  startMarker = "// <prisma-laravel:start>"
  endMarker   = "// <prisma-laravel:end>"
  noEmit      = false                   // set true to skip writing files
  groups      = "./prisma/group-stubs.js" // optional group mapping
}

generator modeler {
  provider      = "prisma-laravel-models"
  stubDir       = "./prisma/stubs"
  output        = "app/Models"
  outputDir     = "app/Models"          // takes precedence
  outputEnumDir = "app/Enums"           // enums folder (optional)
  startMarker   = "// <prisma-laravel:start>"
  endMarker     = "// <prisma-laravel:end>"
  noEmit        = false
  groups        = "./prisma/group-stubs.js"
}

Field Reference

Key	Notes

output / outputDir	Destination folder; outputDir overrides output.
outputEnumDir	(modeler) folder for PHP enum classes.
stubDir	Root stubs folder (migration/, model/, enum/).
startMarker / endMarker	Region markers the generator will update.
groups	Path to JS module exporting stub-group mappings.
noEmit	If true, generator parses but writes no files.



---

📁 Stub Folder Layout

Running

npx prisma-laravel-cli init --schema=prisma/schema.prisma

creates:

prisma/stubs/
├── migration/index.stub
├── model/index.stub
├── model/simple-model.stub
└── enum/index.stub

Copy log (example):

➡️  Copied migration.stub → stubs/migration/index.stub
➡️  Copied model.stub     → stubs/model/index.stub
➡️  Copied enums.stub     → stubs/enum/index.stub
➡️  Copied simple-model.stub → stubs/model/simple-model.stub

Override a single table / enum by adding
stubs/<type>/<name>.stub (e.g. stubs/model/users.stub).


---

🔧 CLI Commands

Command	Purpose

init	Injects generator blocks & scaffold stub folders.
customize	Create per-table stub overrides.
gen	Run prisma generate and then Laravel generators.


init

npx prisma-laravel-cli init --schema=prisma/schema.prisma

customize

# create migration+model overrides for users & accounts
npx prisma-laravel-cli customize -t migration,model -n users,accounts

# create enum overrides
npx prisma-laravel-cli customize -t enum -n UserStatus,RoleType

migration & model may be combined; enum must be separate.

gen

# run prisma generate then Laravel generation
npx prisma-laravel-cli gen --config=prisma/laravel.config.js

# skip prisma generate step
npx prisma-laravel-cli gen --config=prisma/laravel.config.js --skipGenerate

prisma/laravel.config.js example:

module.exports = {
  migrator: {
    outputDir: 'database/migrations',
    stubDir: 'prisma/stubs',
    groups: './prisma/group-stubs.js',
  },
  modeler: {
    outputDir: 'app/Models',
    outputEnumDir: 'app/Enums',
    stubDir: 'prisma/stubs',
    groups: './prisma/group-stubs.js',
  },
};


---

🧩 Grouping Stubs

prisma/group-stubs.js

module.exports = [
  { stubFile: 'auth.stub',    tables: ['users','accounts','password_resets'] },
  { stubFile: 'billing.stub', tables: ['invoices','transactions'] },
];

Resolution order

1. stubs/<type>/<table>.stub


2. Matching group stub (stubFile)


3. stubs/<type>/index.stub




---

✨ Stub Customization Notes

Stubs are JavaScript template literals. Escape \` and \${ } if you need them literally.

Keep the ${content} placeholder inside the marker block if you want the generator to keep injecting its dynamic chunk.

> Full Custom Model Stubs
If you plan to hand-craft a model stub completely—removing both the ${content} placeholder and the // <prisma-laravel:start> / // <prisma-laravel:end> markers—set
noEmit = true for the modeler generator (or exclude that table via custom rules).
Otherwise, the generator has nowhere to inject its code and will skip the file.
Leaving the markers + ${content} lets you customise everything around the generated region while the tool continues to maintain fillable lists, casts, and relations automatically.




---

📑 Default Stub Templates

Enum

<?php

namespace App\\Enums;

enum ${enumDef.name}: string
{
    // <prisma-laravel:start>
${enumDef.values.map(v => `    case ${v} = '${v}';`).join('\\n')}
    // <prisma-laravel:end>
}

Migration

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


---

🏗️ Complex Model Stub Example

<?php

namespace App\\Models;

${model.imports}
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\{ BelongsTo, HasMany, BelongsToMany };

class ${model.className} extends Model
{
    protected $table = '${model.tableName}';

    /* ---------- Mass Assignment ---------- */
    protected $fillable = [
${model.properties.filter(p => p.fillable).map(p => `        '${p.name}',`).join('\\n')}
    ];
    protected $guarded = [
${(model.guarded ?? []).map(n => `        '${n}',`).join('\\n')}
    ];

    /* ---------- Hidden / Casts ---------- */
    protected $hidden = [
${model.properties.filter(p => p.hidden).map(p => `        '${p.name}',`).join('\\n')}
    ];
    protected $casts = [
${model.properties.filter(p => p.cast).map(p => `        '${p.name}' => '${p.cast}',`).join('\\n')}
${model.properties.filter(p => p.enumRef).map(p => `        '${p.name}' => ${p.enumRef}::class,`).join('\\n')}
    ];

    /* ---------- Eager Loading ---------- */
    protected $with = [
${(model.with ?? []).map(r => `        '${r}',`).join('\\n')}
    ];

    /* ---------- Interfaces ---------- */
    public array $interfaces = [
${Object.entries(model.interfaces).map(([k,i]) => `        '${k}' => {${i.import ? ` import: '${i.import}',` : ''} type: '${i.type}' },`).join('\\n')}
    ];

    /* ---------- Relationships ---------- */
${model.relations.map(r => {
  const args = [r.modelClass, r.foreignKey ? `'${r.foreignKey}'` : '', r.localKey ? `'${r.localKey}'` : ''].filter(Boolean).join(', ');
  return `    public function ${r.name}(): ${r.type.charAt(0).toUpperCase() + r.type.slice(1)}\\n    {\\n        return $this->${r.type}(${args});\\n    }`;
}).join('\\n\\n')}

    // <prisma-laravel:start>
    ${content}
    // <prisma-laravel:end>
}


---

📚 Interfaces Metadata Example

Useful for fumeapp/modeltyper integration:

public array $interfaces = [
    'props' => [
        'import' => \"@typings/service-forms\",
        'type'   => 'ServiceProps',
    ],
    'services' => [
        'type' => 'Array<SMMService>',
    ],
];

Type definition:
Record<string, { import?: string; type: string }>.


---

🚀 Enum Casting

The generator automatically casts Prisma enums:

protected $casts = [
    'status' => StatusEnum::class,
];

Enums are saved to outputEnumDir if configured.


---

💡 Tips

Combine migration & model in the same customize command when table names align.

Escape template characters in stub files.

Use noEmit: true for dry-runs or CI validation.



---

📜 License

MIT — Happy scaffolding! 🎉

---

Copy that entire block into **README.md** and you’ll have the corrected, full documentation—including the note about fully custom model stubs.

