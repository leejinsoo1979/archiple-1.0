/**
 * Command Interface - Base for Undo/Redo system
 * TODO: Add full implementation later
 */

export interface ICommand {
  /** Unique identifier for the command */
  readonly id: string;

  /** Human-readable name for UI */
  readonly name: string;

  /** Execute the command */
  execute(): void;

  /** Undo the command */
  undo(): void;

  /** Optional: Redo (default is re-execute) */
  redo?(): void;

  /** Optional: Check if command can be merged with another */
  canMergeWith?(other: ICommand): boolean;

  /** Optional: Merge with another command */
  mergeWith?(other: ICommand): ICommand;
}

/**
 * Abstract base class for commands
 */
export abstract class Command implements ICommand {
  readonly id: string;
  readonly name: string;
  readonly timestamp: number;

  constructor(name: string) {
    this.id = this.generateId();
    this.name = name;
    this.timestamp = Date.now();
  }

  abstract execute(): void;
  abstract undo(): void;

  redo(): void {
    // Default: just re-execute
    this.execute();
  }

  private generateId(): string {
    // TODO: Implement proper UUID generation
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
