import * as p from "@clack/prompts";
import pc from "picocolors";

export function showIntro(): void {
  p.intro(pc.bgCyan(pc.black(" sheltr ")));
}

export function showOutro(message?: string): void {
  p.outro(message ?? pc.green("Done!"));
}
