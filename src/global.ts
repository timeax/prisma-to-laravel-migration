// Given an object type T, ValueOf<T> is the union of its property‐value types:
type ValueOf<T> = T[keyof T];
