/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from '@google/genai';

// Base64 encoded string of the default conditioning image
const DEFAULT_IMAGE_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAgACADASIAAhEBAxEB/8QAGQABAAMBAQAAAAAAAAAAAAAAAAUGBwID/8QALhAAAQMDAwIDBwUAAAAAAAAAAQIDBAAFEQYSIRMxB1FBBxQiMmGBQlJjcYGh/8QAFgEBAQEAAAAAAAAAAAAAAAAAAgED/8QAGhEBAQEAAwEAAAAAAAAAAAAAAAERAhIhMf/aAAwDAQACEQMRAD8A9yooooCigKKDigKKgXa6wrPEXJmvpaQnoOpUfQAbmqy5cQX65uKbtLLNtY6JcdBeX+g2T+SaXLLF0X+iuGucm7T21fqufLbSdi1hCEg/oAP1qK3fL9ak+G/e3JDR2S+hC1J+igNp+xNIyy31XqVBXJ9kv9sv7RVEeIcT/ADWF7LT+R6j3G1dBQUUUUBRRRQFFFAVV8R3uRa4aWIeDPeJbbB3wgfmd+g/vUvdrrFs0BcyVnwgQAEjKlE7AD3Jrj9yudwuF2VdLg0uM6oBDbKxu02Og9j3PuaTLLB3dFp+mQo0KG3HYSENoGAB/1L96m0KxXG7xYF0Yny45kNFbSGZDiAhWfKSEqA6EA7Vv3uU+w20zGdW06+vwhxBAKAQSpQz2Skn8kVR2WNGtlyf8ABmOQW31IcbkocUAvb5kqztnbfHXPvWM124zQ/cTcN6LJfK3XN3FqUpSifck5NSl6nC4TG2o8hySyy2Gg+4oqU4eqjn2J29gBVhxbChQLK6qO0gLWpLaSMZSTuQfdQBx7E1S6ZpEmdYlQnnVOMocK2AtW7efmA9hnP4IpLJn47fRRRVmFFFFAUUUUH//Z';
const DEFAULT_IMAGE_NAME = 'robot.jpg';
const DEFAULT_IMAGE_MIMETYPE = 'image/jpeg';
const SETTINGS_STORAGE_KEY = 'veo-generation-settings';
const TRANSITION_DURATION = 300;
const VIDEO_TRANSITION_DURATION = 500;

// Fix: Define and use AIStudio interface for window.aistudio to resolve type conflict.
// Define the aistudio property on the window object for TypeScript
declare global {
  interface AIStudio {
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

async function openApiKeyDialog() {
  if (window.aistudio?.openSelectKey) {
    await window.aistudio.openSelectKey();
  } else {
    // This provides a fallback for environments where the dialog isn't available
    showStatusError(
      'API key selection is not available. Please configure the API_KEY environment variable.',
    );
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      // Return only the Base64 part of the data URL
      resolve(url.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const statusEl = document.querySelector('#status') as HTMLParagraphElement;

async function generateContent(
  prompt: string,
  imageBytes: string,
  imageMimeType: string,
  apiKey: string,
  onProgress: (progress: number) => void,
) {
  const ai = new GoogleGenAI({ apiKey });

  const config: any = {
    numberOfVideos: 1,
  };

  if (aspectRatio) {
    config.aspectRatio = aspectRatio;
  }
  if (durationSeconds && !isNaN(durationSeconds)) {
    config.durationSeconds = durationSeconds;
  }
  // NOTE: The 'quality' setting is not currently supported by the Veo API.
  // This is included for future compatibility if the API adds support.
  // if (quality === 'high') {
  //   config.quality = 'high';
  // }

  const params: any = {
    model: 'veo-2.0-generate-001',
    prompt,
    config,
  };

  if (imageBytes) {
    params.image = {
      imageBytes,
      mimeType: imageMimeType,
    };
  }

  let operation = await ai.models.generateVideos(params);

  let pollCount = 0;
  const maxPolls = 20;
  while (!operation.done && pollCount < maxPolls) {
    pollCount++;
    onProgress(pollCount / maxPolls);
    console.log('Waiting for completion');
    await delay(10000); // Poll every 10 seconds
    try {
      operation = await ai.operations.getVideosOperation({ operation });
    } catch (e) {
      console.error('Error polling for operation status:', e);
      throw new Error(
        'Failed to get video generation status. Please try again.',
      );
    }
  }

  if (!operation.done) {
    throw new Error(
      'Video generation timed out. Please try again with a simpler prompt.',
    );
  }

  onProgress(1); // Signal completion of polling

  const videos = operation.response?.generatedVideos;
  if (videos === undefined || videos.length === 0) {
    throw new Error(
      'No videos were generated. The prompt may have been blocked.',
    );
  }

  for (const [i, v] of videos.entries()) {
    const url = decodeURIComponent(v.video.uri);
    // Append API key for access
    const res = await fetch(`${url}&key=${apiKey}`);
    const blob = await res.blob();
    const objectURL = URL.createObjectURL(blob);
    video.src = objectURL;
    currentVideoURL = objectURL;
    console.log('Video ready for playback and download.');

    // Show video and buttons with transition
    video.classList.remove('hidden');
    clearButton.classList.remove('hidden');
    downloadButton.classList.remove('hidden');

    setTimeout(() => {
      video.classList.remove('opacity-0');
      clearButton.classList.remove('opacity-0');
      downloadButton.classList.remove('opacity-0');
    }, 10);
  }
}

// --- DOM Element Selection ---
const upload = document.querySelector('#file-input') as HTMLInputElement;
const promptEl = document.querySelector('#prompt-input') as HTMLTextAreaElement;
const generateButton = document.querySelector(
  '#generate-button',
) as HTMLButtonElement;
const retryButton = document.querySelector(
  '#retry-button',
) as HTMLButtonElement;
const downloadButton = document.querySelector(
  '#download-button',
) as HTMLButtonElement;
const clearButton = document.querySelector(
  '#clear-button',
) as HTMLButtonElement;
const video = document.querySelector('#video') as HTMLVideoElement;
const fileNameEl = document.querySelector('#file-name') as HTMLSpanElement;
const imgPreview = document.querySelector('#img-preview') as HTMLImageElement;
const aspectRatioEl = document.querySelector(
  '#aspect-ratio-select',
) as HTMLSelectElement;
const qualityEl = document.querySelector(
  '#quality-select',
) as HTMLSelectElement;
const durationEl = document.querySelector('#duration-input') as HTMLInputElement;
const durationValueEl = document.querySelector(
  '#duration-value',
) as HTMLSpanElement;
const progressContainerEl = document.querySelector(
  '#progress-container',
) as HTMLDivElement;
const progressBarEl = document.querySelector(
  '#progress-bar',
) as HTMLDivElement;

// --- State Variables ---
let currentVideoURL = '';
let base64data = DEFAULT_IMAGE_BASE64;
let mimeType = DEFAULT_IMAGE_MIMETYPE;
let prompt = promptEl.value;
let aspectRatio = aspectRatioEl.value;
let quality = qualityEl.value;
let durationSeconds = parseInt(durationEl.value, 10);

// --- Functions ---
function saveSettings() {
  const settings = {
    prompt,
    base64data,
    mimeType,
    fileName: fileNameEl.textContent,
    aspectRatio,
    quality,
    durationSeconds,
  };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

// --- Event Listeners ---
upload.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    fileNameEl.textContent = file.name;
    mimeType = file.type;
    base64data = await blobToBase64(file);
    imgPreview.src = `data:${mimeType};base64,${base64data}`;
    imgPreview.style.display = 'block';
  } else {
    fileNameEl.textContent = 'No file chosen';
    base64data = '';
    mimeType = '';
    imgPreview.style.display = 'none';
  }
  saveSettings();
});

promptEl.addEventListener('input', () => {
  prompt = promptEl.value;
  saveSettings();
});

aspectRatioEl.addEventListener('change', () => {
  aspectRatio = aspectRatioEl.value;
  saveSettings();
});

qualityEl.addEventListener('change', () => {
  quality = qualityEl.value;
  saveSettings();
});

durationEl.addEventListener('input', () => {
  durationSeconds = parseInt(durationEl.value, 10);
  if (durationValueEl) {
    durationValueEl.textContent = durationEl.value;
  }
  saveSettings();
});

generateButton.addEventListener('click', () => {
  if (!prompt.trim()) {
    showStatusError('Please enter a prompt to generate a video.');
    return;
  }
  generate();
});

retryButton.addEventListener('click', () => {
  generate();
});

downloadButton.addEventListener('click', () => {
  if (currentVideoURL) {
    // Generate a descriptive filename from the prompt, keeping it URL-safe
    const filename =
      prompt
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gi, '') // Keep only alphanumeric and spaces
        .trim()
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .substring(0, 50) || 'generated-video'; // Truncate and provide fallback
    downloadFile(currentVideoURL, `${filename}.mp4`);
  }
});

clearButton.addEventListener('click', () => {
  clearOutput();
  generateButton.classList.remove('opacity-0');
});

// --- Functions ---
function clearOutput() {
  // Start fade-out transitions
  video.classList.add('opacity-0');
  clearButton.classList.add('opacity-0');
  downloadButton.classList.add('opacity-0');

  setTimeout(() => {
    if (video.src) {
      URL.revokeObjectURL(video.src);
    }
    video.src = '';
    currentVideoURL = '';
    video.classList.add('hidden');
    clearButton.classList.add('hidden');
    downloadButton.classList.add('hidden');
  }, VIDEO_TRANSITION_DURATION);

  progressContainerEl.classList.add('opacity-0');
  setTimeout(() => {
    progressContainerEl.classList.add('hidden');
  }, TRANSITION_DURATION);
}

function showStatusError(message: string) {
  statusEl.innerHTML = `<span class="text-red-400">${message}</span>`;
  progressContainerEl.classList.add('opacity-0');
  setTimeout(
    () => progressContainerEl.classList.add('hidden'),
    TRANSITION_DURATION,
  );
}

function setControlsDisabled(disabled: boolean) {
  generateButton.disabled = disabled;
  upload.disabled = disabled;
  promptEl.disabled = disabled;
  aspectRatioEl.disabled = disabled;
  qualityEl.disabled = disabled;
  durationEl.disabled = disabled;
}

async function generate() {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    showStatusError('API key is not configured. Please add your API key.');
    await openApiKeyDialog();
    return;
  }

  statusEl.innerText = 'Initializing video generation...';
  // Hide any previous output/error states
  clearOutput();
  retryButton.classList.add('opacity-0');
  setTimeout(() => retryButton.classList.add('hidden'), TRANSITION_DURATION);

  // Fade out the generate button
  generateButton.classList.add('opacity-0');

  // Fade in the progress bar
  progressContainerEl.classList.remove('hidden');
  setTimeout(() => progressContainerEl.classList.remove('opacity-0'), 10);

  progressBarEl.style.width = '0%';
  setControlsDisabled(true);

  const onProgress = (progress: number) => {
    const percent = Math.min(100, Math.floor(progress * 100));
    progressBarEl.style.width = `${percent}%`;
    if (progress < 1) {
      statusEl.innerText = `Generating... This can take a few minutes. (${percent}%)`;
    } else {
      statusEl.innerText = `Processing video...`;
    }
  };

  try {
    await generateContent(prompt, base64data, mimeType, apiKey, onProgress);
    statusEl.innerText = 'Video generated successfully.';
    progressContainerEl.classList.add('opacity-0');
    setTimeout(() => {
      progressContainerEl.classList.add('hidden');
    }, TRANSITION_DURATION);
  } catch (e) {
    console.error('Video generation failed:', e);
    const errorMessage =
      e instanceof Error ? e.message : 'An unknown error occurred.';

    let userFriendlyMessage = `Error: ${errorMessage}`;
    let shouldOpenDialog = false;

    if (typeof errorMessage === 'string') {
      if (errorMessage.includes('Requested entity was not found.')) {
        userFriendlyMessage =
          'Model not found. This can be caused by an invalid API key or permission issues. Please check your API key.';
        shouldOpenDialog = true;
      } else if (
        errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('API key not valid') ||
        errorMessage.toLowerCase().includes('permission denied')
      ) {
        userFriendlyMessage =
          'Your API key is invalid. Please add a valid API key.';
        shouldOpenDialog = true;
      }
    }

    showStatusError(userFriendlyMessage);

    retryButton.classList.remove('hidden');
    setTimeout(() => retryButton.classList.remove('opacity-0'), 10);

    if (shouldOpenDialog) {
      await openApiKeyDialog();
    }
  } finally {
    setControlsDisabled(false);
  }
}

// --- Initial Setup ---
function initializeApp() {
  const savedSettingsJSON = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (savedSettingsJSON) {
    try {
      const savedSettings = JSON.parse(savedSettingsJSON);

      // Restore state variables
      prompt = savedSettings.prompt;
      base64data = savedSettings.base64data;
      mimeType = savedSettings.mimeType;
      aspectRatio = savedSettings.aspectRatio;
      quality = savedSettings.quality;
      durationSeconds = savedSettings.durationSeconds;

      // Restore UI from state
      promptEl.value = prompt;
      aspectRatioEl.value = aspectRatio;
      qualityEl.value = quality;
      durationEl.value = String(durationSeconds);
      if (durationValueEl) {
        durationValueEl.textContent = String(durationSeconds);
      }
      fileNameEl.textContent = savedSettings.fileName;
      if (base64data) {
        imgPreview.src = `data:${mimeType};base64,${base64data}`;
        imgPreview.style.display = 'block';
      } else {
        imgPreview.style.display = 'none';
      }
      return; // Settings loaded successfully
    } catch (e) {
      console.error('Failed to parse saved settings, using defaults.', e);
      localStorage.removeItem(SETTINGS_STORAGE_KEY); // Clear corrupted data
    }
  }

  // Default setup if no valid settings are loaded
  if (base64data) {
    fileNameEl.textContent = DEFAULT_IMAGE_NAME;
    imgPreview.src = `data:${mimeType};base64,${base64data}`;
    imgPreview.style.display = 'block';
  }
  // Save the initial default settings so they persist on next load
  saveSettings();
}

initializeApp();
