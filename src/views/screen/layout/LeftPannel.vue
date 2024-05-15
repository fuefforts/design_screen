<script setup lang="ts">
let ondragstart = (e: any, elem?: any) => {
    let element = e.target;
    element.style.opacity = "0.5"
    if (!elem) {
        return;
    }
    e.stopPropagation();

    // 拖拽事件
    if (e instanceof DragEvent) {
        // 设置拖拽数据
        e.dataTransfer?.setData('Meta2d', JSON.stringify(elem.data));

    } else {
        // 支持单击添加图元。平板模式
        // meta2d.canvas.addCaches = [elem.data];
    }

}
let ondragend = (e: any) => {
    let element = e.target;
    element.style.opacity = "1"

}
</script>
<template>
    <div class="left_pannel_wrapper">
        <div data-v-760cffa4="" class="graphic" draggable="true" style="opacity: 1;" @dragstart="e => ondragstart(e, {
            name: '人',
            icon: 'l-people',
            id: 19,
            data: {
                name: 'echarts',
                x: 100,
                y: 100,
                width: 120,
                height: 80,
                echarts: {
                    option: {
                        color: [
                            '#1890ff',
                            '#2FC25B',
                            '#FACC14',
                            '#c23531',
                            '#2f4554',
                            '#61a0a8',
                            '#d48265'
                        ],
                        xAxis: {
                            type: 'category',
                            data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                        },
                        yAxis: {
                            type: 'value'
                        },
                        series: [
                            {
                                data: [820, 932, 901, 934, 1290, 1330, 1320],
                                type: 'line'
                            }
                        ]
                    }
                }
            },
        },)" @dragend="ondragend">
            <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 80 Q 90 10, 100 80 t 10 -10" fill="#f06" />
                <path d="M110 80 Q 100 10, 100 80 t 10 -10" fill="#f06" />
            </svg>
            <p data-v-760cffa4="" title="基础折线图-hover">基础折线图-hover</p><!---->
        </div>

        <div data-v-760cffa4="" class="graphic" draggable="true" style="opacity: 1;" @dragstart="e => ondragstart(e, {
            name: '正方形',
            icon: 'l-rect',
            id: 1,
            data: {
                width: 100,
                height: 100,
                name: 'square',
            },
        },)" @dragend="ondragend">
            <img src="@/assets/images/echarts_line.svg" alt="">
            <p data-v-760cffa4="" title="基础折线图-hover">基础折线图-hover</p><!---->
        </div>

        <div data-v-760cffa4="" class="graphic" draggable="true" style="opacity: 1;" @dragstart="ondragstart"
            @dragend="ondragend">
            <img src="@/assets/images/echarts_line.svg" alt="">
            <p data-v-760cffa4="" title="基础折线图-hover">基础折线图-hover</p><!---->
        </div>

        <div data-v-760cffa4="" class="graphic" draggable="true" style="opacity: 1;">
            <img src="@/assets/images/echarts_line.svg" alt="">
            <p data-v-760cffa4="" title="基础折线图-hover">基础折线图-hover</p><!---->
        </div>

        <div data-v-760cffa4="" class="graphic" draggable="true" style="opacity: 1;">
            <img src="@/assets/images/echarts_line.svg" alt="">
            <p data-v-760cffa4="" title="基础折线图-hover">基础折线图-hover</p><!---->
        </div>

        <div data-v-760cffa4="" class="graphic" draggable="true" style="opacity: 1;">
            <img src="@/assets/images/echarts_line.svg" alt="">
            <p data-v-760cffa4="" title="基础折线图-hover">基础折线图-hover</p><!---->
        </div>

        <div data-v-760cffa4="" class="graphic" draggable="true" style="opacity: 1;">
            <img src="@/assets/images/echarts_line.svg" alt="">
            <p data-v-760cffa4="" title="基础折线图-hover">基础折线图-hover</p><!---->
        </div>

        <div data-v-760cffa4="" class="graphic" draggable="true" style="opacity: 1;">
            <img src="@/assets/images/echarts_line.svg" alt="">
            <p data-v-760cffa4="" title="基础折线图-hover">基础折线图-hover</p><!---->
        </div>
    </div>
</template>
<style lang="scss" scoped>
.left_pannel_wrapper {
    width: 300px;
    height: 100%;
    border-right: 1px solid $color-border;
    background-color: $color-background;
    display: grid;
    position: relative;
    padding: 4px 4px 20px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-row-gap: 12px;

    .graphic {
        position: relative;
        padding: 10px 0;
        border-radius: 2px;
        border: 1px solid transparent;
        user-select: none;

        img {
            color: #bdc7db;
            height: 32px;
            width: 100%;
            margin: auto
        }

        &:hover {
            cursor: pointer;
            border-color: #4583ff
        }

    }
}
</style>
