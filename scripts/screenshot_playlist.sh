#!/usr/bin/env bash
# Takes a screenshot at the 1-second mark of every video in a playlist
# and saves them into data/<game_name>/ with hashed filenames.
#
# Prerequisites:
#   - yt-dlp (brew install yt-dlp)
#   - ffmpeg (brew install ffmpeg)
#
# Usage:
#   ./scripts/screenshot_playlist.sh <game_name> <playlist_url>
#
# Example:
#   ./scripts/screenshot_playlist.sh zip "https://www.youtube.com/playlist?list=PLLE2dY85AtnfQA-RHK7qynggMLKDMHHJ3"

set -euo pipefail

if [ $# -ne 2 ]; then
    echo "Usage: $0 <game_name> <playlist_url>"
    echo ""
    echo "  game_name    - Name of the game (e.g. zip, tango)"
    echo "  playlist_url - Full YouTube playlist URL"
    exit 1
fi

GAME_NAME="$1"
PLAYLIST_URL="$2"
OUTPUT_DIR="data/$GAME_NAME"
TIMESTAMP="00:00:01"

mkdir -p "$OUTPUT_DIR"

echo "=== Screenshot Extractor: $GAME_NAME ==="
echo ""
echo "Fetching video list from playlist..."

# Get video IDs
VIDEO_IDS=$(yt-dlp --flat-playlist --print "%(id)s" "$PLAYLIST_URL")
VIDEO_COUNT=$(echo "$VIDEO_IDS" | wc -l | tr -d ' ')

echo "Found $VIDEO_COUNT videos."
echo ""

CURRENT=0
FAILED=0

while IFS= read -r VIDEO_ID; do
    CURRENT=$((CURRENT + 1))

    # Hash the video ID for the filename
    HASH=$(echo -n "$VIDEO_ID" | md5 | cut -c1-8)
    OUTPUT_FILE="$OUTPUT_DIR/${GAME_NAME}_${HASH}.png"

    # Skip if already downloaded
    if [ -f "$OUTPUT_FILE" ]; then
        echo "[$CURRENT/$VIDEO_COUNT] SKIP (exists): $VIDEO_ID"
        continue
    fi

    echo "[$CURRENT/$VIDEO_COUNT] Processing: $VIDEO_ID"

    # Get the direct video stream URL
    STREAM_URL=$(yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" \
        --get-url "https://www.youtube.com/watch?v=$VIDEO_ID" 2>/dev/null | head -1) || true

    if [ -z "$STREAM_URL" ]; then
        echo "  WARNING: Could not get stream URL for $VIDEO_ID, skipping."
        FAILED=$((FAILED + 1))
        continue
    fi

    # Extract frame at 1 second using ffmpeg
    ffmpeg -ss "$TIMESTAMP" -i "$STREAM_URL" \
        -vframes 1 -q:v 2 \
        -y "$OUTPUT_FILE" \
        -loglevel error 2>/dev/null || {
        echo "  WARNING: ffmpeg failed for $VIDEO_ID"
        FAILED=$((FAILED + 1))
        continue
    }

    echo "  Saved: $OUTPUT_FILE"

    # Small delay to be polite to YouTube
    sleep 1

done <<< "$VIDEO_IDS"

echo ""
echo "=== Done: $GAME_NAME ==="
echo "Screenshots: $((CURRENT - FAILED))/$VIDEO_COUNT successful"
echo "Output dir:  $OUTPUT_DIR/"
