/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, GeneratedImage, Modality} from '@google/genai';

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

// For type safety with the SDK
type AspectRatio = '1:1' | '3:4' | '4:3' | '16:9';
type Mode = 'text-to-image' | 'image-edit' | 'image-upscale' | 'face-swap';

// -------------------- MODEL CONFIGURATION ---------------------------------------------
const textToImageModel = 'imagen-4.0-generate-001';
const imageEditModel = 'gemini-2.5-flash-image-preview';


// -------------------- DEFAULT PROMPT -------------------------------------------------
const defaultImagenPrompt = 'Editorial wildlife photograph: a sleek black panther standing regally on a reflective salt flat at dusk, wearing a dramatic, sculptural couture gown inspired by organic forms. The landscape is vast and otherworldly but grounded in reality, with subtle shimmering textures and a warm, golden-hour glow. Captured with a cinematic 35mm lens, shallow depth of field, natural shadows, and authentic fur and fabric textures—evoking a high-fashion magazine cover with a surreal, yet believable, atmosphere.';

// App state for uploaded images
let uploadedImageBase64: string | null = null;
let uploadedImageMimeType: string | null = null;
let sourceImageBase64: string | null = null;
let sourceImageMimeType: string | null = null;
let targetImageBase64: string | null = null;
let targetImageMimeType: string | null = null;

// DOM Elements
const form = document.getElementById('controls-form') as HTMLFormElement;
const imageGallery = document.getElementById('image-gallery');
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const negativePromptInput = document.getElementById('negative-prompt-input') as HTMLTextAreaElement;
const clearBtn = document.getElementById('clear-btn');

// Single image upload elements
const imageUploadInput = document.getElementById('image-upload-input') as HTMLInputElement;
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
const removeImageBtn = document.getElementById('remove-image-btn');
const dropZoneWrapper = document.getElementById('drop-zone-wrapper');
const dropZone = document.getElementById('drop-zone');

// Face Swap Source Image elements
const sourceImageUploadInput = document.getElementById('source-image-upload-input') as HTMLInputElement;
const sourceImagePreviewContainer = document.getElementById('source-image-preview-container');
const sourceImagePreview = document.getElementById('source-image-preview') as HTMLImageElement;
const removeSourceImageBtn = document.getElementById('remove-source-image-btn');
const sourceDropZoneWrapper = document.getElementById('source-drop-zone-wrapper');
const sourceDropZone = document.querySelector('#source-drop-zone-wrapper .drop-zone');

// Face Swap Target Image elements
const targetImageUploadInput = document.getElementById('target-image-upload-input') as HTMLInputElement;
const targetImagePreviewContainer = document.getElementById('target-image-preview-container');
const targetImagePreview = document.getElementById('target-image-preview') as HTMLImageElement;
const removeTargetImageBtn = document.getElementById('remove-target-image-btn');
const targetDropZoneWrapper = document.getElementById('target-drop-zone-wrapper');
const targetDropZone = document.querySelector('#target-drop-zone-wrapper .drop-zone');

// Fieldsets for UI toggling
const promptFieldset = document.getElementById('prompt-fieldset');
const imageUploadFieldset = document.getElementById('image-upload-fieldset');
const faceSwapFieldset = document.getElementById('face-swap-fieldset');
const negativePromptFieldset = document.getElementById('negative-prompt-fieldset');
const aspectRatioFieldset = document.getElementById('aspect-ratio-fieldset');
const styleFieldset = document.getElementById('style-fieldset');

/**
 * Main function to generate images based on the currently selected mode.
 */
async function generate() {
  if (!imageGallery || !promptInput) return;

  const selectedMode = (document.querySelector('input[name="mode"]:checked') as HTMLInputElement).value as Mode;

  imageGallery.innerHTML = '';
  imageGallery.classList.add('loading');
  
  try {
    if (selectedMode === 'image-edit' || selectedMode === 'image-upscale') {
        if (!uploadedImageBase64 || !uploadedImageMimeType) {
            alert(`Please upload an image for ${selectedMode === 'image-edit' ? 'editing' : 'upscaling'}.`);
            imageGallery.classList.remove('loading');
            return;
        }

        let promptForEdit: string;
        if (selectedMode === 'image-edit') {
            promptForEdit = promptInput.value;
            if (!promptForEdit.trim()) {
                alert('Please enter a prompt for editing.');
                imageGallery.classList.remove('loading');
                return;
            }
        } else { // upscale mode
            promptForEdit = 'Upscale this image to a higher resolution, enhancing details without altering the content or style.';
        }
      
        const response = await ai.models.generateContent({
            model: imageEditModel,
            contents: {
                parts: [
                    { inlineData: { data: uploadedImageBase64, mimeType: uploadedImageMimeType } },
                    { text: promptForEdit },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        
        response.candidates[0].content.parts.forEach(part => {
             if (part.inlineData) {
                const base64ImageBytes = part.inlineData.data;
                const imageUrl = `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
                appendImage(imageUrl);
            }
        });

    } else if (selectedMode === 'face-swap') {
        if (!sourceImageBase64 || !targetImageBase64) {
            alert('Please upload both a source face and a target image for face swap.');
            imageGallery.classList.remove('loading');
            return;
        }

        const response = await ai.models.generateContent({
            model: imageEditModel,
            contents: {
                parts: [
                    { inlineData: { data: sourceImageBase64, mimeType: sourceImageMimeType! } },
                    { inlineData: { data: targetImageBase64, mimeType: targetImageMimeType! } },
                    { text: "From the first image provided, extract the face. Then, seamlessly swap this face onto the most prominent person in the second image provided. Ensure the lighting, skin tone, and angle of the new face match the target image's environment." },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        response.candidates[0].content.parts.forEach(part => {
             if (part.inlineData) {
                const base64ImageBytes = part.inlineData.data;
                const imageUrl = `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
                appendImage(imageUrl);
            }
        });

    } else { // text-to-image mode
        const userPrompt = promptInput.value;
        if (!userPrompt.trim()) {
            alert('Please enter a prompt.');
            imageGallery.classList.remove('loading');
            return;
        }
        const selectedStyle = (document.querySelector('input[name="imageStyle"]:checked') as HTMLInputElement).value;
        const finalPrompt = selectedStyle ? `${selectedStyle}, ${userPrompt}` : userPrompt;
        const negativePrompt = negativePromptInput.value;
        const selectedAspectRatio = (document.querySelector('input[name="aspectRatio"]:checked') as HTMLInputElement).value as AspectRatio;

        const response = await ai.models.generateImages({
            model: textToImageModel,
            prompt: finalPrompt,
            config: {
                numberOfImages: 4,
                outputMimeType: 'image/png',
                aspectRatio: selectedAspectRatio,
                negativePrompt: negativePrompt,
            },
        });

        response.generatedImages.forEach((image: GeneratedImage) => {
            const imageUrl = `data:image/png;base64,${image.image.imageBytes}`;
            appendImage(imageUrl);
        });
    }
  } catch (error) {
    console.error(error);
    alert('An error occurred while generating images. Check the console for details.');
  } finally {
    imageGallery.classList.remove('loading');
  }
}

/**
 * Appends a generated image with a download button to the gallery.
 * @param {string} imageUrl - The data URL of the image to append.
 */
function appendImage(imageUrl: string) {
  if (!imageGallery) return;

  const imageContainer = document.createElement('div');
  imageContainer.className = 'image-container';

  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = promptInput.value || 'Generated/Edited Image';

  const downloadLink = document.createElement('a');
  downloadLink.href = imageUrl;
  downloadLink.download = `imagen-generated-${Date.now()}.png`;
  downloadLink.className = 'download-btn';
  downloadLink.textContent = 'Download';
  downloadLink.setAttribute('aria-label', 'Download image');

  imageContainer.appendChild(img);
  imageContainer.appendChild(downloadLink);
  imageGallery.appendChild(imageContainer);
}

/**
 * Converts a file to a base64 string.
 * @param file The file to convert.
 * @returns A promise that resolves with the base64 string and mime type.
 */
function fileToBase64(file: File): Promise<{ base64: string, mimeType: string }> {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            return reject(new Error('File is not an image.'));
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            const base64 = result.split(',')[1];
            resolve({ base64, mimeType: file.type });
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

/**
 * Processes the single uploaded file.
 */
async function handleSingleFile(file: File) {
    try {
        const { base64, mimeType } = await fileToBase64(file);
        uploadedImageBase64 = base64;
        uploadedImageMimeType = mimeType;
        imagePreview.src = `data:${mimeType};base64,${base64}`;
        imagePreviewContainer?.classList.remove('hidden');
        dropZoneWrapper?.classList.add('hidden');
    } catch (error) {
        alert((error as Error).message);
    }
}

/**
 * Processes the source image file for face swap.
 */
async function handleSourceFile(file: File) {
    try {
        const { base64, mimeType } = await fileToBase64(file);
        sourceImageBase64 = base64;
        sourceImageMimeType = mimeType;
        sourceImagePreview.src = `data:${mimeType};base64,${base64}`;
        sourceImagePreviewContainer?.classList.remove('hidden');
        sourceDropZoneWrapper?.classList.add('hidden');
    } catch (error) {
        alert((error as Error).message);
    }
}

/**
 * Processes the target image file for face swap.
 */
async function handleTargetFile(file: File) {
    try {
        const { base64, mimeType } = await fileToBase64(file);
        targetImageBase64 = base64;
        targetImageMimeType = mimeType;
        targetImagePreview.src = `data:${mimeType};base64,${base64}`;
        targetImagePreviewContainer?.classList.remove('hidden');
        targetDropZoneWrapper?.classList.add('hidden');
    } catch (error) {
        alert((error as Error).message);
    }
}

function removeSingleUploadedImage() {
    uploadedImageBase64 = null;
    uploadedImageMimeType = null;
    if (imageUploadInput) imageUploadInput.value = '';
    imagePreviewContainer?.classList.add('hidden');
    dropZoneWrapper?.classList.remove('hidden');
}

function removeSourceImage() {
    sourceImageBase64 = null;
    sourceImageMimeType = null;
    if(sourceImageUploadInput) sourceImageUploadInput.value = '';
    sourceImagePreviewContainer?.classList.add('hidden');
    sourceDropZoneWrapper?.classList.remove('hidden');
}

function removeTargetImage() {
    targetImageBase64 = null;
    targetImageMimeType = null;
    if(targetImageUploadInput) targetImageUploadInput.value = '';
    targetImagePreviewContainer?.classList.add('hidden');
    targetDropZoneWrapper?.classList.remove('hidden');
}

function clearAll() {
    promptInput.value = '';
    negativePromptInput.value = '';
    if (imageGallery) imageGallery.innerHTML = '';
    removeSingleUploadedImage();
    removeSourceImage();
    removeTargetImage();
}

/**
 * Toggles the visibility of form controls based on the selected mode.
 */
function updateUiForMode(mode: Mode) {
    const allFieldsets = [promptFieldset, imageUploadFieldset, faceSwapFieldset, negativePromptFieldset, aspectRatioFieldset, styleFieldset];
    allFieldsets.forEach(fs => fs?.classList.add('hidden'));

    if (mode === 'text-to-image') {
        promptFieldset?.classList.remove('hidden');
        negativePromptFieldset?.classList.remove('hidden');
        aspectRatioFieldset?.classList.remove('hidden');
        styleFieldset?.classList.remove('hidden');
        removeSingleUploadedImage();
        removeSourceImage();
        removeTargetImage();
    } else if (mode === 'image-edit') {
        promptFieldset?.classList.remove('hidden');
        imageUploadFieldset?.classList.remove('hidden');
        removeSourceImage();
        removeTargetImage();
    } else if (mode === 'image-upscale') {
        imageUploadFieldset?.classList.remove('hidden');
        removeSourceImage();
        removeTargetImage();
    } else if (mode === 'face-swap') {
        faceSwapFieldset?.classList.remove('hidden');
        removeSingleUploadedImage();
    }
}

// -------------------- EVENT LISTENERS ---------------------------------------------
form?.addEventListener('submit', (e) => {
    e.preventDefault();
    generate();
});

clearBtn?.addEventListener('click', clearAll);

// Generic function to set up drag and drop listeners
function setupDragAndDrop(zone: Element | null, fileHandler: (file: File) => void) {
    if (!zone) return;
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
    });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        if ((e as DragEvent).dataTransfer?.files[0]) {
            fileHandler((e as DragEvent).dataTransfer!.files[0]);
        }
    });
}

// Setup listeners
setupDragAndDrop(dropZone, handleSingleFile);
setupDragAndDrop(sourceDropZone, handleSourceFile);
setupDragAndDrop(targetDropZone, handleTargetFile);

imageUploadInput?.addEventListener('change', () => imageUploadInput.files?.[0] && handleSingleFile(imageUploadInput.files[0]));
sourceImageUploadInput?.addEventListener('change', () => sourceImageUploadInput.files?.[0] && handleSourceFile(sourceImageUploadInput.files[0]));
targetImageUploadInput?.addEventListener('change', () => targetImageUploadInput.files?.[0] && handleTargetFile(targetImageUploadInput.files[0]));

removeImageBtn?.addEventListener('click', removeSingleUploadedImage);
removeSourceImageBtn?.addEventListener('click', removeSourceImage);
removeTargetImageBtn?.addEventListener('click', removeTargetImage);

document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', (event) => {
        updateUiForMode((event.target as HTMLInputElement).value as Mode);
    });
});

// -------------------- INITIALIZATION ---------------------------------------------
promptInput.value = defaultImagenPrompt;
updateUiForMode('text-to-image'); // Set initial UI state