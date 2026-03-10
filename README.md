> [!Important] AI Usage Disclaimer
> Due to my lack of skill in  programming with TS, I have used AI to do the following:
> 1. Use the data from the code snippet OpenMeteo.TS to create a summary
> 2. Set up TS (i.e. dist, node_modules, etc.)
> 
> I have also used AI to speed up the execution of the following tasks:
> 1. Formulate the clothing database
> 2. Setup both config files
> 
> I have used AI to do tasks that I believed were beyond my current capability, and to do tasks that I could have done but would have taken too long.
> However, I promise you that I will improve in both programming and TS, so that I can make this sort of thing without needing AI.

# Design Brief
Problem 2: SkyWardrobe (Real-Time Weather Advisor)
This challenge requires you to build a lifestyle utility service that bridges the gap between live environmental data and daily user needs. You will create an application that fetches real-time weather metrics and processes them through a custom logic engine to provide context-aware clothing recommendations for the user.
Core Requirements:
Data Integration: Fetch live weather data (temperature, humidity, precipitation) from a public API like OpenWeatherMap.
Recommendation Engine: Map weather states to a local dataset (JSON or Database) of clothing items to generate a logical "Outfit of the Day."
Resiliency: Implement a fallback strategy for when the third-party API is unreachable or rate-limited.
Key things to note:
How you define the thresholds for specific weather categories (e.g., "cold" vs. "chilly").

# NOTES FOR FUTURE ME:
Warmth stacks with layers. 
- Take the average of the upper and lower clothes to get the warmth of one layer.
- Then add all layers together to get the total warmth.
- So if the max and min temp are in different bands:
    - Have it such that the outermost layer is the one that matches the max warmth band; 
    - and the innermost layer is the one that matches the min warmth band.
Breathability stacks with layers, in much the same manner.
Windchill prevention does not stack. 
- Take the max of all clothes to get the total windchill prevention.
Water resistance does not stack. 
- Same as windchill prevention

# Future additions:
Use the complements property to match clothes
Use Formality to filter
Add a 'vibe' property to the clothing items
Graphics for the clothing items, and use those in the UI
Allow user to modify database and preferences through the UI, and save those changes to the files
