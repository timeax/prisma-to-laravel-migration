import { RelationDefinition } from "./types";
type TemplateOptions = {
    useCompoships?: boolean;
    indent?: string;
};
export declare function relationTemplate(def: RelationDefinition, opts?: TemplateOptions): string;
export {};
