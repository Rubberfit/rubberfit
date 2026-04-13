import "reflect-metadata"
import { container } from "tsyringe"

export function resolveUseCase<T>(token: symbol): T {
  return container.resolve<T>(token)
}
