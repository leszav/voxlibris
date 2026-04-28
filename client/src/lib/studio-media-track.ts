export function bindStudioMicrophoneEnded(
  stream: MediaStream,
  onEnded: () => void,
): () => void {
  const track = stream.getAudioTracks()[0];
  if (!track) {
    return () => {};
  }

  track.addEventListener('ended', onEnded);
  return () => {
    track.removeEventListener('ended', onEnded);
  };
}
