import { createInterface } from "node:readline";

export async function confirm(toolName: string, input: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const inputJson = JSON.stringify(input, null, 2);
    const prompt = `[tool] ${toolName}\n  input: ${inputJson}\nConfirm? [y/N]: `;

    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer === "y" || answer === "Y");
    });
  });
}
