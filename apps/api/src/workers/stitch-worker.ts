import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { db } from '../lib/db.js';
import { config } from '../lib/config.js';
import { stitchJobSchema } from './stitch.js';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import fetch from 'node-fetch';

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['--js-runtimes', 'deno', '-f', 'best[ext=mp4]/best', '-o', outputPath, url];
    let process = spawn('yt-dlp', args);
    let binaryFailed = false;
    let stderr = '';

    process.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    process.on('error', () => {
      binaryFailed = true;
      process = spawn('python3', ['-m', 'yt_dlp', ...args]);
      let fallbackStderr = '';

      process.stderr.on('data', (data: Buffer) => {
        fallbackStderr += data.toString();
      });

      process.on('exit', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}: ${fallbackStderr}`));
        }
      });

      process.on('error', (err: Error) => {
        reject(new Error(`Failed to run yt-dlp: ${err.message}`));
      });
    });

    if (!binaryFailed) {
      process.on('exit', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          console.error(`yt-dlp error: ${stderr}`);
          reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
        }
      });
    }
  });
}

export async function processStitchJob(message: any) {
  const { urls, audioUrl, ctaUrl } = message;

  // Create job ID
  const jobId = uuidv4();
  
  // Initialize job in database
  const job = {
    id: jobId,
    status: 'queued',
    progress: 0,
    outputUrl: '',
    error: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  db.jobs.set(jobId, job);
  
  try {
    // Update status to processing
    job.status = 'processing';
    job.progress = 10;
    job.updatedAt = new Date().toISOString();
    db.jobs.set(jobId, job);

    // Download videos
    const videoFiles: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const outputPath = path.join(tmpdir(), `${jobId}_video_${i}.mp4`);
      await downloadVideo(urls[i], outputPath);
      videoFiles.push(outputPath);
      
      // Update progress
      job.progress = 20 + Math.round((i / urls.length) * 40);
      job.updatedAt = new Date().toISOString();
      db.jobs.set(jobId, job);
    }

    // Download optional audio
    let audioFile: string | undefined;
    if (audioUrl) {
      const audioResp = await fetch(audioUrl);
      if (!audioResp.ok) throw new Error('Failed to download audio');
      audioFile = path.join(tmpdir(), `${jobId}_audio.mp3`);
      writeFileSync(audioFile, Buffer.from(await audioResp.arrayBuffer()));
      
      job.progress = 70;
      job.updatedAt = new Date().toISOString();
      db.jobs.set(jobId, job);
    }

    // Prepare output
    const outputFile = path.join(tmpdir(), `${jobId}_output.mp4`);
    
    // Stitch with ffmpeg
    await new Promise<void>((resolve, reject) => {
      let cmd = ffmpeg();
      videoFiles.forEach(file => cmd = cmd.input(file));
      if (audioFile) cmd = cmd.input(audioFile);
      
      cmd.output(outputFile)
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
        .run();
    });

    // In a real implementation, you would upload to storage and return URL
    // For now, we'll simulate by returning a placeholder
    const outputUrl = `${config.API_BASE_URL}/stitched/${jobId}.mp4`;
    
    // Cleanup temp files
    videoFiles.forEach(file => { if (existsSync(file)) unlinkSync(file); });
    if (audioFile && existsSync(audioFile)) unlinkSync(audioFile);
    
    // Update job as done
    job.status = 'done';
    job.progress = 100;
    job.outputUrl = outputUrl;
    job.updatedAt = new Date().toISOString();
    db.jobs.set(jobId, job);
    
    return job;
  } catch (error) {
    // Handle error
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = new Date().toISOString();
    db.jobs.set(jobId, job);
    throw error;
  }
}