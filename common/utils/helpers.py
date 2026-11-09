from pathlib import Path



class SysUtils:
    @staticmethod
    def get_app_version(version_file: str) -> str:
        try:
            return Path(version_file).read_text().strip()

        except:
            print(f'Unable to determine app version, {version_file} not found')
            return 'unknown'
