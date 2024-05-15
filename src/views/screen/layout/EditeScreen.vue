<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { F2d } from './component/core/core';
const click = ref({
    x: 0,
    y: 0
})
//  拖拽主要展示区域

onMounted(() => {
    // 创建实例
    new F2d('meta2d', {
        rule: true,
        width: 1920,
        height: 1080,
        ruleOptions: {
            underline: true,
            background: "#1e2430",
        },
        background: "#1e2430",
        origin: {
            x: 20,
            y: 20
        }
    });
    $(".resizable").each((_index: any, item: any) => {
        ($(item) as any)
            .resizable({
                start: onResizeStart,
                resize: onResize,
                stop: onResizeEnd
            })
            .draggable({
                start: onDragStart,
                drag: onDrag,
                stop: onDragEnd
            });
    });
});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let onResizeStart = (_e: any) => {
    ($(".resizable") as any).unbind("click");

};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let onResize = (_e: any, _el: any) => {
    // 
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let onResizeEnd = (e: any, el: any) => {
    ($(".resizable") as any).bind("click");
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let onDragStart = (_e: any) => {
    $(".resizable").unbind("click");

    _e.target.style.opacity = "0.5"

};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let onDrag = (_e: any, _el: any) => {
    // 
    _e.target.style.opacity = "0.5"
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let onDragEnd = (_e: any, _el: any) => {
    ($(".resizable") as any).bind("click");
    click.value.x = _el.position.left;
    click.value.y = _el.position.top;
    _e.target.style.opacity = "1"
};

let ondragenter = (_e: any) => {
    console.log(_e);
    _e.preventDefault();  // 阻止默认的拖放行为
    _e.dataTransfer.dropEffect = "move";  // 设置拖放效果为"copy"

}
let ondragover = (_e: any) => {
    _e.preventDefault();  // 阻止默认的拖放行为
    _e.dataTransfer.dropEffect = "copy";  // 设置拖放效果为"copy"

}


</script>
<template>
    <!-- <div class=""></div> -->
    <div class="edite_screen" @dragenter="ondragenter" @dragover="ondragover">
        <!-- <div class="drag resizable"></div> -->
        <div id="meta2d"></div>

    </div>
</template>

<style lang="scss" scoped>
#meta2d {
    height: calc(100vh - 40px);
    z-index: 1;
}

.edite_screen {
    flex: 1;
    height: 100%;
    border-right: 1px solid $color-border;
    background-color: #080b0f;
    position: relative;

    .drag {
        position: absolute;
        top: 0;
        left: 0;
        width: 200px;
        height: 200px;
        border: 1px solid rgb(69, 149, 223);
    }
}
</style>