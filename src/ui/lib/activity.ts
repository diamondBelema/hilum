// src/ui/lib/activity.ts
type MutationFn<T> = () => Promise<T>;
type RollbackFn<T> = (previousState: T) => void;

interface StateMutationManagerOptions<T> {
  currentState: T;
  setState: React.Dispatch<React.SetStateAction<T>>;
  onError?: (error: unknown) => void;
}

export async function executeOptimisticMutation<T, R>(
  {
    currentState,
    setState,
    onError,
  }: StateMutationManagerOptions<T>,
  optimisticUpdate: (prev: T) => T,
  mutation: MutationFn<R>
): Promise<R | void> {
  const previousState = currentState;

  // 1. Apply optimistic update locally immediately
  setState(optimisticUpdate);

  try {
    // 2. Execute underlying network mutation
    const result = await mutation();
    return result;
  } catch (error) {
    // 3. Rollback state snapshot on server write failure
    setState(previousState);
    console.error('Mutation failed, rolling back state update:', error);
    if (onError) {
      onError(error);
    } else {
      throw error;
    }
  }
}
