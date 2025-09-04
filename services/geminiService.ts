import { GoogleGenAI, Type } from "@google/genai";
import type { Part } from "@google/genai";

// Fix: Use process.env.API_KEY as per the guidelines.
if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set. Please add it to your environment file or Vercel project settings.");
}

// Fix: Initialize with process.env.API_KEY directly.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = "gemini-2.5-flash";

export async function identifyHeadersFromFiles(
  fileParts: Part[]
): Promise<string[]> {
  const prompt = `You are an expert at analyzing documents.
Analyze the provided documents (images or PDFs) and identify all possible unique column headers or data fields that could be extracted.
Think about what kind of information is present and what would make sense as columns in a structured table.
Return a single JSON array of strings, where each string is a suggested header.
Example response: ["Invoice Number", "Date", "Total Amount", "Customer Name", "Line Item Description"]
Do not include any other text or markdown formatting. The response must be only the JSON array.`;

  const contents = [{ parts: [{ text: prompt }, ...fileParts] }];

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: contents,
      config: {
        responseMimeType: "application/json",
        // Fix: Added responseSchema for more reliable JSON output as per guidelines.
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
          },
        },
      },
    });

    const resultText = response.text.trim();
    const headers = JSON.parse(resultText);
    if (Array.isArray(headers) && headers.every(h => typeof h === 'string')) {
      return [...new Set(headers)]; // Deduplicate headers
    }
    throw new Error("AI response was not a valid JSON array of strings.");

  } catch (error) {
    console.error("Gemini API call for header identification failed:", error);
    throw new Error("Failed to identify headers from the AI model.");
  }
}

export async function extractInfoFromSingleFile(
  orderedHeaders: string[],
  additionalPrompt: string,
  filePart: Part
): Promise<string> {
  const systemPrompt = `You are an intelligent document processing assistant.
The user has provided a list of headers they want to extract: [${orderedHeaders.map(h => `"${h}"`).join(', ')}].
Your task is to process the provided document based on this list of headers.
Create a single JSON object containing the extracted information. The keys of the object must exactly match the provided headers.
If you cannot find information for a specific header in the document, return null for that field's value.
Return only the JSON object.
Do not include any explanatory text, markdown formatting (like \`\`\`json), or anything else outside of the final JSON object.
${additionalPrompt ? `The user has also provided these additional instructions: "${additionalPrompt}"` : ''}`;
  
  const contents = [
    {
      parts: [
        { text: systemPrompt },
        filePart
      ]
    }
  ];

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: contents,
      config: {
        responseMimeType: "application/json",
      },
    });

    return response.text;
  } catch (error) {
    console.error("Gemini API call failed:", error);
    throw new Error("Failed to get a response from the AI model. Please check the console for more details.");
  }
}

export async function testApiKey(): Promise<{ success: boolean; error?: string }> {
  try {
    // A very simple, low-cost request to verify the key and model access.
    await ai.models.generateContent({
      model: model,
      contents: [{ parts: [{ text: "hello" }] }],
      config: {
        // Use a very small token limit to make the call fast and cheap.
        maxOutputTokens: 10,
        thinkingConfig: { thinkingBudget: 0 }, // Disable thinking for speed
      },
    });
    return { success: true };
  } catch (error: any) {
    console.error("API Key test failed:", error);
    // Attempt to provide a more user-friendly error message.
    let errorMessage = "An unknown error occurred during the API key test.";
    if (error.message) {
        if (error.message.includes('API_KEY_INVALID')) {
            errorMessage = "The provided API Key is invalid. Please check your Vercel environment variables.";
        } else if (error.message.includes('permission_denied')) {
             errorMessage = "Permission denied. Please check your API key and ensure the Generative Language API is enabled in your Google Cloud project.";
        } else if (error.message.toLowerCase().includes('billing')) {
            errorMessage = "Billing issue. Please ensure billing is enabled for your project in the Google Cloud console.";
        } else {
            errorMessage = error.message;
        }
    }
    return { success: false, error: errorMessage };
  }
}
