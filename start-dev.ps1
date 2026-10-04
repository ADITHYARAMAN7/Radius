if (-not (Test-Path "jdk-21.0.2")) {
    Write-Host "Downloading OpenJDK 21..."
    Invoke-WebRequest -Uri "https://download.java.net/java/GA/jdk21.0.2/f2283984656d49d69e91c558476027ac/13/GPL/openjdk-21.0.2_windows-x64_bin.zip" -OutFile "jdk-21.zip"
    Write-Host "Extracting OpenJDK 21..."
    Expand-Archive -Path "jdk-21.zip" -DestinationPath "." -Force
    Remove-Item "jdk-21.zip"
}
$env:JAVA_HOME = "$pwd\jdk-21.0.2"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
npm run dev
