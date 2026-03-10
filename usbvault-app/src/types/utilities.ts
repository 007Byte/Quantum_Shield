// PH4-FIX: Shared type utilities to replace `any` usage

import { AppError } from '@/errors';

/**
 * JSON-compatible value type that includes primitives, arrays, and objects
 * Use this instead of `any` for data that can be serialized to/from JSON
 */
export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

/**
 * Generic JSON object type for API responses and serialized data
 * Use this instead of `any` for plain objects with string keys
 */
export type JSONObject = Record<string, JSONValue>;

/**
 * Result type for async operations that can succeed or fail
 * Use this instead of `any | undefined` for error handling
 * Example: const result: AsyncResult<User> = await fetchUser(id);
 */
export type AsyncResult<T> =
  | { data: T; error: null }
  | { data: null; error: AppError };

/**
 * Nullable type for values that may be null
 * Use instead of `T | null` for clarity
 */
export type Nullable<T> = T | null;

/**
 * Optional type for values that may be undefined
 * Use instead of `T | undefined` for clarity
 */
export type Optional<T> = T | undefined;

/**
 * Result type for operations that can succeed or fail
 * Use instead of `any` for error handling
 * Example: type DeleteResult = Result<boolean>;
 */
export type Result<T> =
  | { success: true; value: T }
  | { success: false; error: AppError };

/**
 * Union type for either a value or an error
 * Useful for discriminated unions in error handling
 */
export type Either<E, A> = { tag: 'left'; value: E } | { tag: 'right'; value: A };

/**
 * Indexed record type for objects with specific key types
 * Use instead of `Record<string, any>`
 */
export type IndexedRecord<K extends string | number | symbol, V> = Record<K, V>;

/**
 * Configuration object type for settings/options
 * Use instead of `any` for configuration objects
 */
export type Config = Record<string, JSONValue>;

/**
 * Generic dictionary type for mapping values
 * Use instead of `Record<string, any>`
 */
export type Dictionary<T = JSONValue> = Record<string, T>;

/**
 * Type-safe array index type
 * Helps catch array access errors
 */
export type ArrayIndex = number & { readonly __brand: 'ArrayIndex' };

/**
 * Create a branded array index safely
 */
export function createArrayIndex(index: number): ArrayIndex | null {
  if (Number.isInteger(index) && index >= 0) {
    return index as ArrayIndex;
  }
  return null;
}

/**
 * Generic constructor type for classes
 * Use instead of `any` for constructor references
 */
export type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Promise that resolves with a value or rejects with an AppError
 */
export type SafePromise<T> = Promise<AsyncResult<T>>;

/**
 * Async function that returns AsyncResult instead of throwing
 */
export type SafeAsyncFn<T> = () => SafePromise<T>;

/**
 * Predicate function type for filtering
 * Use instead of `(item: any) => boolean`
 */
export type Predicate<T> = (item: T) => boolean;

/**
 * Mapper function type for transformations
 * Use instead of `(item: any) => any`
 */
export type Mapper<T, U> = (item: T) => U;

/**
 * Reducer function type for aggregations
 * Use instead of `(acc: any, curr: any) => any`
 */
export type Reducer<T, U> = (acc: U, curr: T) => U;

/**
 * Event handler type for safe event handling
 * Use instead of `(event: any) => void`
 */
export type EventHandler<E = Event> = (event: E) => void;

/**
 * Change handler type for form inputs
 */
export type ChangeHandler<T> = (value: T) => void;

/**
 * Callback function type with potential error
 */
export type ErrorCallback = (error: AppError) => void;

/**
 * Callback function type with success value
 */
export type SuccessCallback<T> = (value: T) => void;

/**
 * Callback function type with both success and error handlers
 */
export type ResultCallback<T> = {
  onSuccess: SuccessCallback<T>;
  onError: ErrorCallback;
};

/**
 * React Native Pressable state callback type for style functions
 * Extends both native PressableStateCallbackType and web hover state
 * Use instead of `state: any` in Pressable style callbacks
 * Example: style={(state: PressableState) => [...]}
 *
 * Note: React Native's Pressable provides 'pressed', web provides 'hovered'.
 * This type safely handles both cases.
 */
export type PressableState = {
  pressed: boolean;
  hovered?: boolean;
};
