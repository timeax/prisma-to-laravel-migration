type ValueOf<T> = T[keyof T];
declare global {
    var _config: {
        model?: {
            awobaz?: boolean;
            [x: string]: any;
        };
        [x: string]: any;
    };
    var MigrationTypes: {
        [key: string]: string;
    };
    var RelationTypes: {
        [key: string]: string;
    };
}
