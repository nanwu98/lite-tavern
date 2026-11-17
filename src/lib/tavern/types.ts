/**
 * Data shapes for character-card code (Tavern Helper / JS-Slash-Runner compatible).
 * These mirror the fields stored inside a card's `data.extensions` block.
 */

export interface ScriptButton {
  name: string;
  visible: boolean;
}

export interface TavernScript {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  info?: string;
  button?: {
    enabled: boolean;
    buttons: ScriptButton[];
  };
}

export interface TavernRegex {
  id: string;
  scriptName: string;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  placement: number[];
  disabled: boolean;
  markdownOnly: boolean;
  promptOnly: boolean;
  runOnEdit: boolean;
  substituteRegex: number;
  minDepth: number | null;
  maxDepth: number | null;
}

export const REGEX_PLACEMENT = {
  USER_INPUT: 1,
  AI_OUTPUT: 2,
  SLASH_COMMAND: 3,
  WORLD_INFO: 5,
  REASONING: 6,
} as const;

export interface CardCode {
  scripts: TavernScript[];
  regexScripts: TavernRegex[];
  depthPrompt?: string;
  depthPromptDepth?: number;
  depthPromptRole?: number;
}
