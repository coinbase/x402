# Makefile para o módulo do kernel Catedral FS (1028.2)

obj-m += catedral_fs.o

KDIR ?= /lib/modules/$(shell uname -r)/build
PWD := $(shell pwd)

all:
	$(MAKE) -C $(KDIR) M=$(PWD) modules

clean:
	$(MAKE) -C $(KDIR) M=$(PWD) clean

load:
	sudo insmod catedral_fs.ko
	sudo chmod 666 /dev/catedral_fs

unload:
	sudo rmmod catedral_fs

status:
	@lsmod | grep catedral_fs || echo "Módulo não carregado"
	@ls -la /dev/catedral_fs 2>/dev/null || echo "Dispositivo não encontrado"

.PHONY: all clean load unload status
