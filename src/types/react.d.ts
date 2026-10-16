import "react";

declare module "react" {
  /**
   * React 19.2 useEffectEvent hook: creates an event handler that can read the latest
   * props/state without being added to the dependencies of useEffect.
   */
  export function useEffectEvent<Args extends unknown[], Return>(
    callback: (...args: Args) => Return
  ): (...args: Args) => Return;
}
