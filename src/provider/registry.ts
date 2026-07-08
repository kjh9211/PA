/**
 * Provider registry - maps provider names to factories that construct
 * ReviewProvider instances. Depends only on the shared type contract.
 */

import type { ReviewProvider } from "../shared/types.js";

export type ProviderFactory = (config?: Record<string, unknown>) => ReviewProvider;

export class ProviderRegistry {
  private readonly factories = new Map<string, ProviderFactory>();

  register(name: string, factory: ProviderFactory): void {
    this.factories.set(name, factory);
  }

  create(name: string, config?: Record<string, unknown>): ReviewProvider {
    const factory = this.factories.get(name);
    if (!factory) {
      const registered = this.list();
      const registeredList = registered.length > 0 ? registered.join(", ") : "none";
      throw new Error(`Unknown provider "${name}". Registered providers: ${registeredList}`);
    }
    return factory(config);
  }

  has(name: string): boolean {
    return this.factories.has(name);
  }

  list(): string[] {
    return Array.from(this.factories.keys());
  }
}

export const defaultRegistry = new ProviderRegistry();
