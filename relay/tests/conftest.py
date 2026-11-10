import os, tempfile


KEY = 'k' * 40

os.environ.setdefault('DEVICE_KEY', KEY)
os.environ.setdefault('RECORDINGS_DIR', tempfile.mkdtemp(prefix='speed-recordings-'))
os.environ.setdefault('LOG_LEVEL', 'warning')
