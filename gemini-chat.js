import * as dotenv from "dotenv";
dotenv.config();

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { BufferMemory } from "langchain/memory";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { RunnableSequence } from "@langchain/core/runnables";
import { Tool } from "@langchain/core/tools";
// Importação adicional para melhor prática
import { ToolMessage } from "@langchain/core/messages";

// --- 1. DEFINIÇÃO DA FUNÇÃO (TOOL) ---
class ObterIdadeAtualTool extends Tool {
  name = "obter_idade_atual";
  description = "Retorna a idade atual de uma pessoa ou entidade. Use esta ferramenta quando o usuário perguntar sobre 'minha idade', 'sua idade' ou 'qual a idade'.";
  
  schema = {
    type: "object",
    properties: {},
  };

  async _call(input) {
    const idade = 30; 
    console.log(`\n*** TOOL EXECUTADA: Idade retornada: ${idade} ***\n`);
    return `A idade atual é ${idade} anos.`;
  }
}

const tools = [new ObterIdadeAtualTool()];

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  temperature: 0.7,
});

const modelWithTools = model.bind({ tools: tools });

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "Você é um assistente prestativo chamado Gema. Responda educadamente e use a ferramenta 'obter_idade_atual' quando necessário."],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
]);

const memory = new BufferMemory({
  memoryKey: "chat_history",
  returnMessages: true,
});

const chain = RunnableSequence.from([
  {
    input: (i) => i.input,
    chat_history: async (_) => (await memory.loadMemoryVariables({})).chat_history,
  },
  prompt,
  modelWithTools,
]);

startChat();

async function startChat() {
  const rl = readline.createInterface({ input, output });
  console.log("Chat iniciado! (Digite 'sair' para terminar) 👋");

  const shutdown = () => {
    try {
      rl.close();
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    while (true) {
      const userInput = await rl.question("Fala meu cumpade: ");

      if (userInput.toLowerCase() === "sair") {
        console.log("Até mais! 😊");
        shutdown();
        break;
      }

      try {
        const inputs = { input: userInput };
        
        let response = await chain.invoke(inputs);
        
        if (response.tool_calls && response.tool_calls.length > 0) {
          console.log("\n*** Gema solicitou uma Chamada de Função... ***");
          
          const toolOutputs = [];

          for (const call of response.tool_calls) {
            const toolToRun = tools.find((tool) => tool.name === call.name);
            
            if (toolToRun) {
              const output = await toolToRun.call(call.args);
              
              toolOutputs.push(new ToolMessage({
                  content: output,
                  name: call.name,
                  toolCallId: call.id,
              }));
            }
          }
          
          const secondResponse = await modelWithTools.invoke([
            ...(await memory.loadMemoryVariables({})).chat_history, 
            response, 
            ...toolOutputs,
          ]);
          
          response = secondResponse;
          console.log("*** Resposta final baseada na Tool recebida. ***\n");
        }

        await memory.saveContext(inputs, {
            output: response.content,
        });

        // IMPRIME A RESPOSTA FINAL
        console.log(`Gema: ${response.content}`); // <<-- Alterado de 'response.text' para 'response.content'
        
      } catch (err) {
        console.error("Falha ao gerar resposta:", err?.message ?? err);
      }
    }
  } finally {
    shutdown();
  }
}