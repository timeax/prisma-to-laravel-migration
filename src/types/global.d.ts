import { MigratorConfig } from "generator/migrator";
import { ModelConfig } from "generator/modeler";

// Given an object type T, ValueOf<T> is the union of its property‐value types:
type ValueOf<T> = T[keyof T];

declare global {
   // Global config object, populated by build.ts
   var _config: Config;

   var global: typeof globalThis;
}


interface Config {
   model: ModelConfig;
   migrator: MigratorConfig
}