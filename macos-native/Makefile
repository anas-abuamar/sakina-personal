APP       := Sakina
BUNDLE_ID := com.anasabuamar.SakinaNative
CONFIG    ?= release

BUILD_DIR := .build/$(CONFIG)
APP_DIR   := build/$(APP).app
SIGN_ID   ?= -

.PHONY: all build bundle sign run stop clean

all: sign

build:
	swift build -c $(CONFIG)

bundle: build
	rm -rf $(APP_DIR)
	mkdir -p $(APP_DIR)/Contents/MacOS $(APP_DIR)/Contents/Resources
	cp $(BUILD_DIR)/$(APP) $(APP_DIR)/Contents/MacOS/$(APP)
	cp Resources/Sakina-Info.plist $(APP_DIR)/Contents/Info.plist

sign: bundle
	codesign --force --sign "$(SIGN_ID)" --identifier "$(BUNDLE_ID)" "$(APP_DIR)"

run: all stop
	open "$(APP_DIR)"

stop:
	-@pkill -x $(APP) 2>/dev/null || true

clean:
	rm -rf .build build
