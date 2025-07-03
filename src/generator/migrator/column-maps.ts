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

export const PrismaTypes = {
   // ──────────────── TEXT / STRING ────────────────\
   Text: "Text",
   TinyText: "TinyText",
   MediumText: "MediumText",
   LongText: "LongText",
   Char: "Char",
   NChar: "NChar",
   CatalogSingleChar: "CatalogSingleChar",
   VarChar: "VarChar",
   NVarChar: "NVarChar",
   String: "String",
   Xml: "Xml",
   NText: "NText",
   Citext: "Citext",

   // ──────────────── BOOLEAN / BIT ───────────────
   Boolean: "Boolean",
   Bool: "Bool",
   Bit: "Bit",
   VarBit: "VarBit",

   // ──────────────── INTEGERS ────────────────────
   TinyInt: "TinyInt",
   UnsignedTinyInt: "UnsignedTinyInt",
   SmallInt: "SmallInt",
   UnsignedSmallInt: "UnsignedSmallInt",
   MediumInt: "MediumInt",
   UnsignedMediumInt: "UnsignedMediumInt",
   Int2: "Int2",
   Int4: "Int4",
   Int8: "Int8",
   Integer: "Integer",
   Int: "Int",
   BigInt: "BigInt",
   Long: "Long",
   Oid: "Oid",
   UnsignedInt: "UnsignedInt",
   UnsignedBigInt: "UnsignedBigInt",

   // ──────────────── FLOAT / DOUBLE / DECIMAL ────
   Float4: "Float4",
   Float8: "Float8",
   Float: "Float",
   Double: "Double",
   DoublePrecision: "DoublePrecision",
   Real: "Real",
   Decimal: "Decimal",
   Money: "Money",
   SmallMoney: "SmallMoney",

   // ──────────────── DATE / TIME ─────────────────
   Date: "Date",
   Time: "Time",
   Timetz: "Timetz",
   Timestamp: "Timestamp",
   Timestamptz: "Timestamptz",
   DateTime: "DateTime",
   DateTime2: "DateTime2",
   SmallDateTime: "SmallDateTime",
   DateTimeOffset: "DateTimeOffset",
   Year: "Year",

   // ──────────────── JSON / BINARY ───────────────
   Json: "Json",
   JsonB: "JsonB",
   ByteA: "ByteA",
   Binary: "Binary",
   VarBinary: "VarBinary",
   TinyBlob: "TinyBlob",
   Blob: "Blob",
   MediumBlob: "MediumBlob",
   LongBlob: "LongBlob",
   BinData: "BinData",
   Image: "Image",
   Bytes: "Bytes",

   // ──────────────── UUID / ID ───────────────────
   Uuid: "Uuid",
   UniqueIdentifier: "UniqueIdentifier",
   ObjectId: "ObjectId",

   // ──────────────── NETWORK / OTHER ─────────────
   Inet: "Inet",
}

export function getType(type: string) {
   //@ts-ignore
   return NativeToMigrationTypeMap[type] as ValueOf<typeof NativeToMigrationTypeMap>
}