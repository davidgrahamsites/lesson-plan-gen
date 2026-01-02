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
        song: string;
        teacherName: string;
        className: string;
    },
    provider: 'openai' | 'gemini',
    apiKey: string
) => {
    const prompt = `
    You are an expert curriculum designer for ESL. Generate a professional lesson plan.
    
    CONTEXT:
    Day: ${context.day}
    Subject: ${context.subject}
    Learning Targets: ${context.targets}
    Game Name: ${context.gameName}
    Game Description (LITERAL): ${context.gameDescription}
    Spiral Review (Oldest): ${context.spiralReview.oldest}
    Spiral Review (Recent): ${context.spiralReview.recent}
    Song of the Week: ${context.song}
    Teacher: ${context.teacherName}
    Class: ${context.className}

    STRICT RULES FOR BREVITY:
    1. EXTREME BREVITY. This is for a busy teacher. No long paragraphs.
    2. SECTION LIMITS:
       - Objectives: Max 2 short bullet points.
       - Introduction: STRICT FORMAT: "Sing [Song Name] -> Review: [Oldest Sentence] / [Recent Sentence]". NO other text.
       - Activity: Max 3 short steps.
       - Game: Paste the Name and a brief 1-2 sentence version of the description.
       - Closure: Max 1 sentence.
    3. NO BOLDING. NO Meta-commentary. NO "For this game...". NO "AI" narrating.
    
    OUTPUT FORMAT (JSON ONLY):
    {
      "activityName": "WEEK X [DAY] - [SUBJECT]",
      "objectives": "Concise list.",
      "materials": "Concise list.",
      "introduction": "Sing ${context.song} -> Review: ...",
      "activity": "Short activity steps.",
      "game": "LITERAL Name\\nBrief adapted description.",
      "closure": "Short closing."
    }
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
