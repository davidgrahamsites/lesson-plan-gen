import Tesseract from 'tesseract.js';

export const OCRProcessor = async (file: File) => {
    const result = await Tesseract.recognize(file, 'eng', {
        logger: m => console.log(m)
    });
    return result.data.text;
};

export const AISynthesizer = async (
    gameDesc: string,
    learningTargets: string,
    provider: 'openai' | 'gemini',
    apiKey: string
) => {
    const prompt = `
    You are an educational assistant. 
    Modify the following game description to incorporate the specific learning targets for the day.
    
    Original Game Description:
    "${gameDesc}"
    
    Learning Targets for the day:
    "${learningTargets}"
    
    Instructions:
    - Keep the core mechanics of the game.
    - Replace generic placeholders (like [skill], [topic], etc.) with the actual learning targets.
    - The output should be the modified game description only.
  `;

    if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(`OpenAI Error: ${data.error.message}`);
        if (!data.choices?.[0]) throw new Error("OpenAI returned an empty response.");
        return data.choices[0].message.content;
    } else {
        // Gemini implementation
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(`Gemini Error: ${data.error.message}`);
        if (!data.candidates?.[0]) throw new Error("Gemini returned an empty response. This might be due to safety filters.");
        return data.candidates[0].content.parts[0].text;
    }
};
export const AdvancedLessonPlanSynthesizer = async (
    context: {
        day: string;
        subject: string;
        targets: string;
        gameName: string;
        gameDescription: string;
        spiralReview: { oldest: string; recent: string };
        teacherName: string;
        className: string;
    },
    provider: 'openai' | 'gemini',
    apiKey: string
) => {
    const prompt = `
    You are an expert curriculum designer. Based on the context below, generate a professional, detailed lesson plan.
    
    CONTEXT:
    Day: ${context.day}
    Subject: ${context.subject}
    Learning Targets: ${context.targets}
    Game Name: ${context.gameName}
    Game Description (LITERAL): ${context.gameDescription}
    Spiral Review (Oldest): ${context.spiralReview.oldest}
    Spiral Review (Recent): ${context.spiralReview.recent}
    Teacher: ${context.teacherName}
    Class: ${context.className}

    STRICT FORMATTING RULES:
    1. NO BOLDING. Do not use asterisks (**) or any markdown bolding.
    2. NO META-COMMENTARY. Do not include phrases like "Adapt the game to...", "For this game...", "Based on...", or "Here is the plan...".
    3. NO "AI" SUMMARIES. Do not rewrite or shorten the game description.
    4. NO BULLET POINTS with ".,".
    
    SECTION SPECIFIC RULES:
    - GAME SECTION: You MUST output the literal 'Game Name' followed by the literal 'Game Description' provided. Do not summarize it. Do not adapt it with AI notes. Just paste it.
    - INTRODUCTION SECTION: Include the spiral review items naturally within the intro flow. Use the literal spiral review text.
    - OBJECTIVES: Use the literal Learning Targets to form 1-3 specific objectives.
    - STYLE: Professional, concise, and clean.

    OUTPUT FORMAT:
    Return a valid JSON object:
    {
      "activityName": "e.g., WEEK 2 THURSDAY - PHONICS",
      "objectives": "List of 1-3 objectives.",
      "materials": "List of materials needed.",
      "introduction": "Intro steps (5 mins) including the spiral review.",
      "activity": "Step-by-step teaching activity (8 mins).",
      "game": "LITERAL Game Name\\nLITERAL Game Description",
      "closure": "Wrap-up (4 mins) with review and praise."
    }

    Respond ONLY with the JSON object.
  `;

    const getResponse = async (p: string) => {
        if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: p }],
                    response_format: { type: "json_object" }
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(`OpenAI Error: ${data.error.message}`);
            return data.choices[0].message.content;
        } else {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: p }] }]
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(`Gemini Error: ${data.error.message}`);
            // Gemini flash doesn't always support json mode as cleanly, but we'll try to parse it.
            let text = data.candidates[0].content.parts[0].text;
            // Strip markdown block if present
            if (text.includes('```json')) {
                text = text.split('```json')[1].split('```')[0].trim();
            } else if (text.includes('```')) {
                text = text.split('```')[1].split('```')[0].trim();
            }
            return text;
        }
    };

    const resultText = await getResponse(prompt);
    try {
        return JSON.parse(resultText);
    } catch (e) {
        console.error("Failed to parse AI JSON:", resultText);
        throw new Error("AI returned an invalid JSON format. Please try again.");
    }
};
