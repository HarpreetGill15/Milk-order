import { Camera, Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from './button'

interface ImageCaptureLike { takePhoto(): Promise<Blob> }
declare global { interface Window { ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike } }

/**
 * Full-screen camera inside the app. Photos stay in memory (they're never saved to the phone's
 * gallery) and are handed back as blobs. Uses the full-resolution ImageCapture API where the
 * browser has it (Android Chrome), otherwise grabs a frame from the video (iPhone).
 */
export function CameraCapture({ onPhoto, onClose, count }: { onPhoto: (photo: Blob) => void; onClose: () => void; count: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices?.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play() }
      })
      .catch((err: unknown) => {
        const name = err instanceof DOMException ? err.name : ''
        setError(name === 'NotAllowedError' ? 'Camera permission was denied. Allow the camera for this site, or use "Choose pictures" instead.' : 'The camera could not be opened. Use "Choose pictures" instead.')
      })
    if (!navigator.mediaDevices?.getUserMedia) setError('This browser has no camera access. Use "Choose pictures" instead.')
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(track => track.stop()) }
  }, [])

  const capture = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    const video = videoRef.current
    if (!track || !video) return
    setFlash(true)
    setTimeout(() => setFlash(false), 150)
    try {
      if (window.ImageCapture) { onPhoto(await new window.ImageCapture(track).takePhoto()); return }
    } catch { /* fall back to a video frame */ }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    canvas.toBlob(blob => blob && onPhoto(blob), 'image/jpeg', 0.95)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-3">
        <button className="rounded-full p-2" aria-label="Close camera" onClick={onClose}><X className="h-6 w-6" /></button>
        <span className="text-sm">{count} photo{count === 1 ? '' : 's'} taken</span>
      </div>
      <div className="relative min-h-0 flex-1">
        {error ? <p className="p-6 text-center">{error}</p> : <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />}
        {flash && <div className="absolute inset-0 bg-white/70" />}
        {!error && <p className="absolute inset-x-0 top-2 text-center text-xs text-white/80">Fill the screen with the report, hold steady, avoid glare</p>}
      </div>
      <div className="flex items-center justify-around p-5">
        <span className="w-20" />
        <button aria-label="Take photo" disabled={!!error} onClick={() => void capture()} className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 active:bg-white/60 disabled:opacity-30">
          <Camera className="h-8 w-8" />
        </button>
        <Button className="w-20" onClick={onClose}><Check className="h-5 w-5" /> Done</Button>
      </div>
    </div>
  )
}
