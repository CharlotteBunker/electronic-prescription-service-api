# Electronic Prescription Service API Tool - E2E Tests

## Prerequisites for WSL2 / Linux

If you want to run Selenium tests on WSL2, you will need to do the following:

1. Install WSL2
1. Install Firefox
```bash
$ sudo apt update
$ sudo apt install firefox -y
```

3. Install [VcXsrv](https://sourceforge.net/projects/vcxsrv/) on your Windows host
3. Add a new inbound firewall rule in Windows to allow connections on port 6000 (for WSL to connect to VcXsrv)
```powershell
PS C:\> New-NetFirewallRule -Direction Inbound -LocalAddress 172.16.0.0/12 -LocalPort 6000 -Protocol TCP -Action Allow -DisplayName "Allow connections from WSL2 to VcXsrv" -Description "Used by NHSD EPS Selenium E2E tests"
```

5. Open XLaunch (VcXsrv), tick the option to **disable** access control, and start the server
5. Add the following to your `~/.bashrc`:
```bash
export DISPLAY=$(ip route list default | awk '{print $3}'):0
export LIBGL_ALWAYS_INDIRECT=1
```

Useful links:
- https://stackoverflow.com/questions/61110603/how-to-set-up-working-x11-forwarding-on-wsl2
- https://blog.henrypoon.com/blog/2020/09/27/running-selenium-webdriver-on-wsl2/


## Running tests

Set the following environment variables to be able to run Selenium tests through Firefox locally:

- Windows
```powershell
$env:LOCAL_MODE="true"
$env:FIREFOX_BINARY_PATH="C:\Program Files\Mozilla Firefox\firefox.exe"  # <-- check this is the correct path for your setup
```

- WSL2 / Linux
```bash
export LOCAL_MODE="true"
export FIREFOX_BINARY_PATH=$(which firefox)
```


Optional config for running tests against a specific environment:

- Windows
```powershell
$env:SERVICE_BASE_PATH="<service_base_path>" # defaults to 'eps-api-tool'
$env:APIGEE_ENVIRONMENT="<apigee_environment>" # defaults to 'internal-dev'
```

- WSL2 / Linux
```bash
export SERVICE_BASE_PATH="<service_base_path>" # defaults to 'eps-api-tool'
export APIGEE_ENVIRONMENT="<apigee_environment>" # defaults to 'internal-dev'
```

To run (on any platform):

```powershell
npm ci
npm run test-live
--or--
npm run test-sandbox
```

Tested on Firefox Version 96.0.3

TODO: add how to run only some tests
