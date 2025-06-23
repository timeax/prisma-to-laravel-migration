import { MigrationTypes } from './migrationTypes.js';

export const NativeToMigrationTypeMap = {
   // ──────────────── TEXT / STRING ────────────────\
   Text: MigrationTypes.text,
   TinyText: MigrationTypes.tinyText,
   MediumText: MigrationTypes.mediumText,
   LongText: MigrationTypes.longText,
   Char: MigrationTypes.char,
   NChar: MigrationTypes.char,
   CatalogSingleChar: MigrationTypes.char,
   VarChar: MigrationTypes.string,
   NVarChar: MigrationTypes.string,
   String: MigrationTypes.string,
   Xml: MigrationTypes.text,
   NText: MigrationTypes.text,
   Citext: MigrationTypes.text,

   // ──────────────── BOOLEAN / BIT ───────────────
   Boolean: MigrationTypes.boolean,
   Bool: MigrationTypes.boolean,
   Bit: MigrationTypes.boolean,
   VarBit: MigrationTypes.binary,

   // ──────────────── INTEGERS ────────────────────
   TinyInt: MigrationTypes.tinyInteger,
   UnsignedTinyInt: MigrationTypes.unsignedTinyInteger,
   SmallInt: MigrationTypes.smallInteger,
   UnsignedSmallInt: MigrationTypes.unsignedSmallInteger,
   MediumInt: MigrationTypes.mediumInteger,
   UnsignedMediumInt: MigrationTypes.unsignedMediumInteger,
   Int2: MigrationTypes.smallInteger,
   Int4: MigrationTypes.integer,
   Int8: MigrationTypes.bigInteger,
   Integer: MigrationTypes.integer,
   Int: MigrationTypes.integer,
   BigInt: MigrationTypes.bigInteger,
   Long: MigrationTypes.bigInteger,
   Oid: MigrationTypes.integer,
   UnsignedInt: MigrationTypes.unsignedInteger,
   UnsignedBigInt: MigrationTypes.unsignedBigInteger,

   // ──────────────── FLOAT / DOUBLE / DECIMAL ────
   Float4: MigrationTypes.float,
   Float8: MigrationTypes.double,
   Float: MigrationTypes.float,
   Double: MigrationTypes.double,
   DoublePrecision: MigrationTypes.double,
   Real: MigrationTypes.double,
   Decimal: MigrationTypes.decimal,
   Money: MigrationTypes.decimal,
   SmallMoney: MigrationTypes.decimal,

   // ──────────────── DATE / TIME ─────────────────
   Date: MigrationTypes.date,
   Time: MigrationTypes.time,
   Timetz: MigrationTypes.timeTz,
   Timestamp: MigrationTypes.timestamp,
   Timestamptz: MigrationTypes.timestampsTz,
   DateTime: MigrationTypes.timestamp,
   DateTime2: MigrationTypes.dateTime,
   SmallDateTime: MigrationTypes.dateTime,
   DateTimeOffset: MigrationTypes.dateTimeTz,
   Year: MigrationTypes.year,

   // ──────────────── JSON / BINARY ───────────────
   Json: MigrationTypes.json,
   JsonB: MigrationTypes.jsonb,
   ByteA: MigrationTypes.binary,
   Binary: MigrationTypes.binary,
   VarBinary: MigrationTypes.binary,
   TinyBlob: MigrationTypes.binary,
   Blob: MigrationTypes.binary,
   MediumBlob: MigrationTypes.binary,
   LongBlob: MigrationTypes.binary,
   BinData: MigrationTypes.binary,
   Image: MigrationTypes.binary,
   Bytes: MigrationTypes.binary,

   // ──────────────── UUID / ID ───────────────────
   Uuid: MigrationTypes.uuid,
   UniqueIdentifier: MigrationTypes.uuid,
   ObjectId: MigrationTypes.string,

   // ──────────────── NETWORK / OTHER ─────────────
   Inet: MigrationTypes.ipAddress,
}

export function getType(type: string) {
   //@ts-ignore
   return NativeToMigrationTypeMap[type] as ValueOf<typeof NativeToMigrationTypeMap>
}