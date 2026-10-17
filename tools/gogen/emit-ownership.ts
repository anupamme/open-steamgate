import type {Context, Expr, Type, Ownership as RuntimeOwnership} from './emit-go-types.ts';

export type OwnershipContext = Context;
// Attribute probes intentionally carry only identity, without expression type.
export interface AttributeProbe { readonly e: 'attr'; readonly name: string }
// A successful lookup identifies precisely the three storage forms supported
// by analyzeOwnership.has; reference fields intentionally remain excluded.
export type OwnedPlace = Extract<Expr, {e: 'var' | 'attr' | 'static'}>;
export type Ownership = Pick<RuntimeOwnership, 'has' | 'unescaped' | 'fixed' | 'width'>;

export interface PackedRenderers {
  readonly ownership: Ownership;
  expr(node: Expr, ctx: OwnershipContext): string;
  helper(name: string): string;
}
export interface OwnedExpressionRenderers extends PackedRenderers {
  place(node: Expr, ctx: OwnershipContext): string;
}
export interface ByteRenderers {
  expr(node: Expr, ctx: OwnershipContext): string;
  place(node: Expr, ctx: OwnershipContext): string;
  rowValue(type: Type, stored: string): string;
}
export interface OwnedRenderers extends OwnedExpressionRenderers, ByteRenderers {}
