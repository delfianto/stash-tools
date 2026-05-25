#!/bin/sh
mediainfo \
  --Output="General;%FileName% -- \
  Video;%Width%x%Height%\r\n\n" *.mp4
