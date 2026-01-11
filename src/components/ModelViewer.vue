<template>
  <div class="model-viewer" @dragover.prevent @drop="handleDrop">
    <div class="viewer-container" ref="containerRef">
      <canvas ref="canvasRef"></canvas>
      <div v-if="isDragging" class="drag-overlay">
        <div class="drag-message">
          <span class="drag-icon">📂</span>
          <p>拖放模型文件或文件夹到这里</p>
        </div>
      </div>
    </div>

    <div class="control-panel">
      <div class="panel-section">
        <h3>模型加载</h3>
        <div class="model-select">
          <label>演示模型:</label>
          <select v-model="selectedDemoModel" @change="loadDemoModel" class="model-dropdown">
            <option value="">-- 选择演示模型 --</option>
            <option v-for="model in demoModels" :key="model.name" :value="model.name">
              {{ model.label }} <span class="format-badge">{{ model.format }}</span>
            </option>
          </select>
        </div>
        <div class="file-upload">
          <input
            type="file"
            ref="fileInputRef"
            @change="handleFileUpload"
            accept=".obj,.fbx,.gltf,.glb,.stl"
            webkitdirectory
            multiple
            style="display: none"
          />
          <button @click="triggerFileUpload" class="upload-btn">
            <span class="icon">📁</span>
            选择模型或文件夹
          </button>
          <p class="supported-formats">
            支持格式: .obj, .fbx, .gltf, .glb, .stl
            <br />
            💡 提示: 拖放文件夹到画布区域也可加载
          </p>
        </div>
      </div>

      <div class="panel-section" v-if="sceneModels.length > 0">
        <h3>场景模型</h3>
        <div class="scene-models-list">
          <div v-for="(model, index) in sceneModels" :key="model.id" class="model-item">
            <div class="model-item-info">
              <span class="model-name">{{ model.name }}</span>
            </div>
            <div class="model-item-actions">
              <button
                @click="toggleModelVisibility(model)"
                class="visibility-btn"
                :title="model.visible ? '隐藏' : '显示'"
              >
                {{ model.visible ? '👁️' : '👁️‍🗨️' }}
              </button>
              <button @click="removeModel(model)" class="remove-btn" title="移除模型">🗑️</button>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <h3>背景设置</h3>
        <div class="background-controls">
          <div class="control-item">
            <input
              type="checkbox"
              id="transparent-bg"
              v-model="isTransparentBg"
              @change="updateBackground"
            />
            <label for="transparent-bg">透明背景</label>
          </div>
          <div v-if="!isTransparentBg" class="control-item">
            <label for="bg-color-picker">背景颜色</label>
            <input id="bg-color-picker" type="color" v-model="bgColor" @change="updateBackground" />
          </div>
        </div>
      </div>

      <div class="panel-section">
        <h3>模型信息</h3>
        <div v-if="modelInfo" class="model-info">
          <p><strong>文件名:</strong> {{ modelInfo.name }}</p>
          <p><strong>格式:</strong> {{ modelInfo.format }}</p>
          <p v-if="modelInfo.size > 0">
            <strong>大小:</strong> {{ formatFileSize(modelInfo.size) }}
          </p>
          <p v-if="modelInfo.vertices"><strong>顶点数:</strong> {{ modelInfo.vertices }}</p>
          <p v-if="modelInfo.animations !== undefined">
            <strong>动画:</strong>
            {{ modelInfo.animations > 0 ? `${modelInfo.animations} 个` : '无' }}
          </p>
        </div>
        <p v-else class="no-model">未加载模型</p>
      </div>

      <div class="panel-section" v-if="hasAnimations">
        <h3>动画控制</h3>
        <div class="animation-controls">
          <button
            @click="toggleAnimation"
            class="animation-toggle-btn"
            :class="{ active: isPlaying }"
          >
            <span class="icon">{{ isPlaying ? '⏸️' : '▶️' }}</span>
            {{ isPlaying ? '暂停动画' : '播放动画' }}
          </button>
          <div class="animation-timeline">
            <label>进度: {{ Number(animationProgress).toFixed(1) }}%</label>
            <input
              type="range"
              v-model="animationProgress"
              min="0"
              max="100"
              step="0.1"
              @input="onProgressChange"
              :disabled="!currentModel || !hasAnimations"
            />
          </div>
          <div class="animation-speed">
            <label>速度: {{ Number(animationSpeed).toFixed(1) }}x</label>
            <input type="range" v-model="animationSpeed" min="0.1" max="3" step="0.1" />
          </div>
        </div>
      </div>

      <div class="panel-section">
        <h3>操作</h3>
        <button @click="exportImage" class="export-btn" :disabled="!currentModel">
          <span class="icon">📷</span>
          导出透明 PNG
        </button>
        <button @click="resetCamera" class="reset-btn">
          <span class="icon">🔄</span>
          重置视角
        </button>
      </div>

      <div class="panel-section">
        <h3>帮助</h3>
        <div class="help-info">
          <p>🖱️ 左键拖动: 旋转视角</p>
          <p>🖱️ 右键拖动: 平移</p>
          <p>🖱️ 滚轮: 缩放</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

// Three.js 相关引用
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'

// DOM 引用
const containerRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const fileInputRef = ref<HTMLInputElement>()

// Three.js 变量
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let currentModel: THREE.Object3D | null = null
let loadingManager: THREE.LoadingManager | null = null
let currentAnimations: THREE.AnimationClip[] = []
let mixer: THREE.AnimationMixer | null = null
let currentAction: THREE.AnimationAction | null = null
const clock = new THREE.Clock()
let modelCounter = 0 // 模型计数器，用于生成唯一ID

// 响应式数据
const bgColor = ref('#1a1a1a')
const isTransparentBg = ref(false)
const sceneModels = ref<
  Array<{
    id: number
    name: string
    object: THREE.Object3D
    visible: boolean
    animations?: THREE.AnimationClip[]
    mixer?: THREE.AnimationMixer
    action?: THREE.AnimationAction
  }>
>([])
const modelInfo = ref<{
  name: string
  format: string
  size: number
  vertices?: number
  animations?: number
} | null>(null)
const isDragging = ref(false)
const resourceMap = ref<Map<string, Blob>>(new Map())
const selectedDemoModel = ref('')
const hasAnimations = ref(false)
const isPlaying = ref(false)
const animationProgress = ref(0)
const animationSpeed = ref(1.0)

// 演示模型列表
const demoModels = ref<
  Array<{
    name: string
    label: string
    path: string
    format: string
  }>
>([
  {
    name: 'swimsuit-character',
    label: '🏊 3D卡通风格泳装女角色模型',
    path: new URL(
      '/models/3D卡通风格泳装女角色模型/8ffa716adb2643a3b9f37f22f37c6c5a.gltf',
      import.meta.url,
    ).href,
    format: '.gltf',
  },
])

/**
 * 初始化 Three.js 场景
 */
const initThree = () => {
  if (!containerRef.value || !canvasRef.value) return

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight

  // 创建场景
  scene = new THREE.Scene()
  scene.background = new THREE.Color(bgColor.value)

  // 创建相机
  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
  camera.position.set(5, 3, 5)

  // 创建渲染器
  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    alpha: isTransparentBg.value,
    preserveDrawingBuffer: true, // 保存画布内容用于导出
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  // 添加环境光
  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture

  // 添加控制器
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.target.set(0, 0, 0)

  // 添加网格辅助线
  // @ts-ignore - GridHelper is available in runtime
  const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x333333)
  scene.add(gridHelper)

  // 添加坐标轴辅助线
  // @ts-ignore - AxesHelper is available in runtime
  const axesHelper = new THREE.AxesHelper(5)
  scene.add(axesHelper)

  // 开始动画循环
  animate()

  // 监听窗口大小变化
  window.addEventListener('resize', onWindowResize)
}

/**
 * 动画循环
 */
const animate = () => {
  requestAnimationFrame(animate)

  // 无论是否播放，都需要获取时间差以保持时钟连续性
  const delta = clock.getDelta()

  // 更新动画混合器
  if (mixer && isPlaying.value) {
    mixer.update(delta * animationSpeed.value)

    // 更新进度
    if (currentAction) {
      const duration = currentAction.getClip().duration
      const currentTime = currentAction.time
      animationProgress.value = (currentTime / duration) * 100

      // 动画播放结束，循环播放
      if (currentTime >= duration) {
        currentAction.reset()
        currentAction.play()
      }
    }
  }

  controls.update()
  renderer.render(scene, camera)
}

/**
 * 窗口大小变化处理
 */
const onWindowResize = () => {
  if (!containerRef.value || !camera || !renderer) return

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight

  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

/**
 * 触发文件上传对话框
 */
const triggerFileUpload = () => {
  fileInputRef.value?.click()
}

/**
 * 处理文件上传
 */
const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])

  if (files.length === 0) return

  // 清空资源映射
  resourceMap.value.clear()

  // 将所有文件添加到资源映射中
  files.forEach((file) => {
    resourceMap.value.set(file.name, file)
  })

  // 找到主模型文件
  const modelExtensions = ['gltf', 'glb', 'obj', 'fbx', 'stl']
  const modelFile = files.find((file) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    return ext && modelExtensions.includes(ext)
  })

  if (modelFile) {
    loadModelFile(modelFile)
  }

  // 重置 input，允许重复上传同一文件
  target.value = ''
}

/**
 * 处理拖放
 */
const handleDrop = async (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = false

  const items = event.dataTransfer?.items
  if (!items) return

  // 清空资源映射
  resourceMap.value.clear()

  // 处理拖放的文件/文件夹
  const entries = Array.from(items)
    .map((item) => item.webkitGetAsEntry())
    .filter(Boolean) as FileSystemEntry[]

  for (const entry of entries) {
    await processEntry(entry)
  }

  // 找到并加载主模型文件
  const modelExtensions = ['gltf', 'glb', 'obj', 'fbx', 'stl']
  for (const [fileName, file] of resourceMap.value) {
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (ext && modelExtensions.includes(ext)) {
      loadModelFile(file)
      break
    }
  }
}

/**
 * 处理文件系统条目
 */
const processEntry = async (entry: FileSystemEntry, path = ''): Promise<void> => {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    return new Promise((resolve) => {
      fileEntry.file((file) => {
        resourceMap.value.set(path + file.name, file)
        resolve()
      })
    })
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    return new Promise((resolve) => {
      const reader = dirEntry.createReader()
      reader.readEntries(async (entries) => {
        for (const child of entries) {
          await processEntry(child, path + dirEntry.name + '/')
        }
        resolve()
      })
    })
  }
}

/**
 * 加载演示模型
 */
const loadDemoModel = async () => {
  if (!selectedDemoModel.value) return

  const selectedModel = demoModels.value.find((m) => m.name === selectedDemoModel.value)
  if (!selectedModel) return

  try {
    // 使用 GLTFLoader 加载演示模型
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(selectedModel.path)

    // 创建模型记录
    const modelData = {
      id: ++modelCounter,
      name: selectedModel.label,
      object: gltf.scene,
      visible: true,
      animations: gltf.animations || [],
    }

    // 添加到场景模型列表
    sceneModels.value.push(modelData)

    // 设置为当前选中的模型
    setCurrentModel(modelData)

    // 立即添加到场景（在设置当前模型之后）
    setupModel(modelData.object)

    // 检查并设置动画
    if (modelData.animations.length > 0) {
      setupAnimations(modelData.object, modelData)
      hasAnimations.value = true
    } else {
      hasAnimations.value = false
    }
  } catch (error) {
    console.error('加载演示模型失败:', error)
    alert('加载演示模型失败，请检查文件是否存在')
  }
}

/**
 * 设置当前选中的模型
 */
const setCurrentModel = (modelData: (typeof sceneModels.value)[0]) => {
  currentModel = modelData.object
  currentAnimations = modelData.animations || []

  const vertices = countVertices(modelData.object)

  // 调整相机以适应当前模型
  const box = new THREE.Box3().setFromObject(modelData.object)
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const cameraDistance = maxDim * 2.5
  camera.position.set(cameraDistance, cameraDistance * 0.6, cameraDistance)
  controls.target.set(0, 0, 0)
  controls.update()

  modelInfo.value = {
    name: modelData.name,
    format: 'GLTF',
    size: 0,
    vertices,
    animations: modelData.animations.length,
  }
}

/**
 * 切换模型可见性
 */
const toggleModelVisibility = (modelData: (typeof sceneModels.value)[0]) => {
  modelData.visible = !modelData.visible
  modelData.object.visible = modelData.visible
}

/**
 * 移除模型
 */
const removeModel = (modelData: (typeof sceneModels.value)[0]) => {
  console.log('移除模型:', modelData.name, modelData.id)
  console.log('模型对象 parent:', modelData.object.parent)
  console.log('场景子对象数:', scene.children.length)

  // 如果移除的是当前模型，先清理
  if (currentModel === modelData.object) {
    cleanupAnimations()
    currentModel = null
    modelInfo.value = null
    hasAnimations.value = false
    isPlaying.value = false
    animationProgress.value = 0
  }

  // 停止并移除动画混合器
  if (modelData.mixer) {
    modelData.mixer.stopAllAction()
    modelData.mixer = null
  }

  // 从场景中移除模型 - 通过索引遍历查找并移除
  // 因为 Vue Proxy 包装导致直接 remove 失效
  for (let i = scene.children.length - 1; i >= 0; i--) {
    if (scene.children[i].uuid === modelData.object.uuid) {
      scene.children.splice(i, 1)
      console.log('已从场景移除模型 (索引:', i, ')')
    }
  }

  // 清理模型资源
  disposeModel(modelData.object)

  // 从列表中移除
  const index = sceneModels.value.findIndex((m) => m.id === modelData.id)
  if (index !== -1) {
    sceneModels.value.splice(index, 1)
  }

  console.log('移除后场景子对象数:', scene.children.length)

  // 如果还有其他模型，选择第一个作为当前模型
  if (sceneModels.value.length > 0 && !currentModel) {
    setCurrentModel(sceneModels.value[0])
  }
}

/**
 * 设置动画
 */
const setupAnimations = (model: THREE.Object3D, modelData?: (typeof sceneModels.value)[0]) => {
  // 优先使用模型数据中的动画，其次使用当前全局动画
  const animations = modelData?.animations || currentAnimations
  if (!animations || animations.length === 0) {
    return
  }

  // 创建动画混合器
  const newMixer = new THREE.AnimationMixer(model)
  const clip = animations[0]
  const action = newMixer.clipAction(clip)

  // 设置动画为循环播放
  action.setLoop(THREE.LoopRepeat)
  action.clampWhenFinished = false

  // 如果是当前模型，更新全局状态
  if (!modelData || currentModel === model) {
    mixer = newMixer
    currentAction = action
    isPlaying.value = false
    animationProgress.value = 0
  }

  // 存储到模型数据中
  if (modelData) {
    modelData.mixer = newMixer
    modelData.action = action
  }
}

/**
 * 清理动画
 */
const cleanupAnimations = () => {
  if (currentAction) {
    currentAction.stop()
    currentAction = null
  }

  if (mixer) {
    mixer.stopAllAction()
    mixer = null
  }

  currentAnimations = []
  hasAnimations.value = false
  isPlaying.value = false
  animationProgress.value = 0
}

/**
 * 切换动画播放状态
 */
const toggleAnimation = () => {
  if (!currentAction || !mixer) return

  console.log('toggleAnimation called, current isPlaying:', isPlaying.value)

  if (isPlaying.value) {
    // 暂停
    currentAction.paused = true
    isPlaying.value = false
  } else {
    // 播放
    if (currentAction.paused) {
      currentAction.paused = false
    } else {
      currentAction.play()
    }
    isPlaying.value = true
  }
}

/**
 * 动画进度变化
 */
const onProgressChange = () => {
  if (!currentAction || !mixer) return

  const duration = currentAction.getClip().duration
  const targetTime = (animationProgress.value / 100) * duration

  // 设置动画时间
  currentAction.time = targetTime
  mixer.update(0)
}

/**
 * 加载模型文件
 */
const loadModelFile = (file: File) => {
  const fileName = file.name.toLowerCase()
  const fileExtension = fileName.split('.').pop()?.toLowerCase()

  // 读取文件
  const reader = new FileReader()
  reader.onload = (e) => {
    const contents = e.target?.result as ArrayBuffer | string
    loadModel(contents, fileExtension || '', file)
  }

  if (fileExtension === 'gltf' || fileExtension === 'glb') {
    reader.readAsArrayBuffer(file)
  } else {
    reader.readAsText(file)
  }
}

/**
 * 根据文件类型加载模型
 */
const loadModel = (contents: ArrayBuffer | string, format: string, file: File) => {
  if (!scene) return

  let vertices = 0
  let modelObject: THREE.Object3D | null = null
  let animations: THREE.AnimationClip[] = []

  // 根据格式选择对应的加载器
  switch (format) {
    case 'gltf':
    case 'glb': {
      // 创建自定义 LoadingManager 用于处理纹理
      loadingManager = new THREE.LoadingManager()

      // 设置资源加载函数
      loadingManager.setURLModifier((url) => {
        const fileName = url.split('/').pop() || url
        if (resourceMap.value.has(fileName)) {
          const blob = resourceMap.value.get(fileName)!
          return URL.createObjectURL(blob)
        }
        return url
      })

      const loader = new GLTFLoader(loadingManager)

      // 异步解析 GLTF
      loader.parse(
        contents as ArrayBuffer,
        '',
        (gltf) => {
          if (gltf.scene) {
            modelObject = gltf.scene
            vertices = countVertices(modelObject)
            animations = gltf.animations || []

            // 立即添加到场景
            setupModel(modelObject)

            // 创建模型记录
            const modelData = {
              id: ++modelCounter,
              name: file.name,
              object: modelObject,
              visible: true,
              animations,
            }

            // 添加到场景模型列表
            sceneModels.value.push(modelData)

            // 设置为当前选中的模型
            setCurrentModel(modelData)

            // 检查并设置动画
            if (animations.length > 0) {
              setupAnimations(modelObject, modelData)
              hasAnimations.value = true
            } else {
              hasAnimations.value = false
            }
          }
        },
        (error) => {
          console.error('GLTF 解析错误:', error)
          alert('GLTF 模型解析失败，请检查文件是否完整')
        },
      )
      return
    }
    case 'obj': {
      const loader = new OBJLoader()
      modelObject = loader.parse(contents as string)
      vertices = countVertices(modelObject)

      // 立即添加到场景
      setupModel(modelObject)

      // 创建模型记录
      const modelData = {
        id: ++modelCounter,
        name: file.name,
        object: modelObject,
        visible: true,
        animations: [],
      }

      sceneModels.value.push(modelData)
      setCurrentModel(modelData)
      hasAnimations.value = false
      break
    }
    case 'fbx': {
      const loader = new FBXLoader()
      const blob = new Blob([contents], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      loader.load(url, (object) => {
        modelObject = object
        vertices = countVertices(object)
        animations = object.animations || []

        // 立即添加到场景
        setupModel(object)

        // 创建模型记录
        const modelData = {
          id: ++modelCounter,
          name: file.name,
          object: modelObject,
          visible: true,
          animations,
        }

        sceneModels.value.push(modelData)
        setCurrentModel(modelData)

        // 检查并设置动画
        if (animations.length > 0) {
          setupAnimations(object, modelData)
          hasAnimations.value = true
        } else {
          hasAnimations.value = false
        }

        URL.revokeObjectURL(url)
      })
      return
    }
    case 'stl': {
      const loader = new STLLoader()
      const geometry = loader.parse(contents as ArrayBuffer)
      const material = new THREE.MeshStandardMaterial({
        color: 0x606060,
        metalness: 0.1,
        roughness: 0.5,
      })
      modelObject = new THREE.Mesh(geometry, material)
      vertices = geometry.attributes.position.count

      // 立即添加到场景
      setupModel(modelObject)

      // 创建模型记录
      const modelData = {
        id: ++modelCounter,
        name: file.name,
        object: modelObject,
        visible: true,
        animations: [],
      }

      sceneModels.value.push(modelData)
      setCurrentModel(modelData)
      hasAnimations.value = false
      break
    }
    default:
      alert('不支持的文件格式')
      return
  }
}

/**
 * 设置模型
 */
const setupModel = (model: THREE.Object3D) => {
  if (!scene) return

  // 计算模型包围盒
  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  // 居中模型
  model.position.sub(center)

  // 添加到场景
  scene.add(model)

  // 调整相机位置
  const maxDim = Math.max(size.x, size.y, size.z)
  const cameraDistance = maxDim * 2.5
  camera.position.set(cameraDistance, cameraDistance * 0.6, cameraDistance)
  controls.target.set(0, 0, 0)
  controls.update()
}

/**
 * 计算顶点数
 */
const countVertices = (object: THREE.Object3D): number => {
  let count = 0
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      count += child.geometry.attributes.position.count
    }
  })
  return count
}

/**
 * 释放模型资源
 */
const disposeModel = (model: THREE.Object3D) => {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
}

/**
 * 更新背景
 */
const updateBackground = () => {
  if (!scene || !renderer) return

  if (isTransparentBg.value) {
    scene.background = null
    renderer.setClearColor(0x000000, 0)
  } else {
    scene.background = new THREE.Color(bgColor.value)
  }

  renderer.alpha = isTransparentBg.value
}

/**
 * 导出透明 PNG 图片
 */
const exportImage = () => {
  if (!canvasRef.value || !renderer) return

  // 临时设置透明背景用于导出
  const originalBackground = scene.background
  const originalAlpha = renderer.alpha

  scene.background = null
  renderer.setClearColor(0x000000, 0)
  renderer.alpha = true
  renderer.render(scene, camera)

  // 导出图片
  const dataURL = canvasRef.value.toDataURL('image/png')
  const link = document.createElement('a')
  link.download = `model_${Date.now()}.png`
  link.href = dataURL
  link.click()

  // 恢复原来的背景设置
  scene.background = originalBackground
  renderer.alpha = originalAlpha
  if (!originalAlpha) {
    renderer.setClearColor(originalBackground || 0x000000, 1)
  }
}

/**
 * 重置相机视角
 */
const resetCamera = () => {
  if (!camera || !controls) return

  if (currentModel) {
    const box = new THREE.Box3().setFromObject(currentModel)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const cameraDistance = maxDim * 2.5
    camera.position.set(cameraDistance, cameraDistance * 0.6, cameraDistance)
  } else {
    camera.position.set(5, 3, 5)
  }

  controls.target.set(0, 0, 0)
  controls.update()
}

/**
 * 格式化文件大小
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

onMounted(() => {
  initThree()
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)

  // 清理所有模型
  sceneModels.value.forEach((modelData) => {
    scene.remove(modelData.object)
    disposeModel(modelData.object)
    if (modelData.mixer) {
      modelData.mixer.stopAllAction()
    }
  })
  sceneModels.value = []

  cleanupAnimations()
  if (currentModel) {
    disposeModel(currentModel)
  }
  if (renderer) {
    renderer.dispose()
  }
})
</script>

<style scoped>
.model-viewer {
  display: flex;
  width: 100%;
  height: 100vh;
  background: #0f0f0f;
}

.viewer-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.viewer-container canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(102, 126, 234, 0.1);
  border: 3px dashed #667eea;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.drag-message {
  text-align: center;
  color: #667eea;
}

.drag-icon {
  font-size: 64px;
  display: block;
  margin-bottom: 16px;
}

.drag-message p {
  font-size: 18px;
  font-weight: 500;
  margin: 0;
}

.control-panel {
  width: 320px;
  background: #1a1a1a;
  border-left: 1px solid #333;
  padding: 20px;
  overflow-y: auto;
  color: #e0e0e0;
}

.panel-section {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #333;
}

.panel-section:last-child {
  border-bottom: none;
}

h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.upload-btn,
.export-btn,
.reset-btn {
  width: 100%;
  padding: 12px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.upload-btn:hover,
.export-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.export-btn:disabled {
  background: #444;
  cursor: not-allowed;
  transform: none;
}

.reset-btn {
  background: #333;
  margin-top: 8px;
}

.reset-btn:hover {
  background: #444;
  transform: translateY(-2px);
}

.icon {
  font-size: 16px;
}

.supported-formats {
  font-size: 12px;
  color: #888;
  margin-top: 12px;
  line-height: 1.6;
}

.model-select {
  margin-bottom: 16px;
}

.model-select label {
  display: block;
  font-size: 13px;
  color: #ccc;
  margin-bottom: 8px;
}

.model-dropdown {
  width: 100%;
  padding: 10px 12px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.scene-models-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #2a2a2a;
  border: 1px solid #333;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.model-item:hover {
  background: #333;
  border-color: #667eea;
}

.model-item-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  overflow: hidden;
}

.model-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.model-name {
  font-size: 13px;
  color: #e0e0e0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-item-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.visibility-btn,
.remove-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.visibility-btn {
  background: #3a3a3a;
}

.visibility-btn:hover {
  background: #4a4a4a;
}

.remove-btn {
  background: #d32f2f;
}

.remove-btn:hover {
  background: #e74c3c;
}

.visibility-btn:disabled,
.remove-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.model-dropdown:hover {
  border-color: #667eea;
}

.model-dropdown:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
}

.model-dropdown option {
  background: #2a2a2a;
  color: #e0e0e0;
  padding: 8px;
}

.format-badge {
  display: inline-block;
  padding: 2px 6px;
  background: #667eea;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  margin-left: 8px;
  color: white;
}

.background-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.control-item label {
  color: #ccc;
  cursor: pointer;
}

.control-item input[type='checkbox'] {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

.control-item input[type='color'] {
  width: 40px;
  height: 28px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: none;
}

.control-item input[type='color']:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.model-info {
  font-size: 13px;
  line-height: 1.8;
}

.model-info p {
  margin: 0;
  color: #ccc;
}

.model-info strong {
  color: #fff;
}

.no-model {
  font-size: 13px;
  color: #666;
  font-style: italic;
}

.help-info {
  font-size: 12px;
  line-height: 1.8;
}

.help-info p {
  margin: 0;
  color: #888;
}

.animation-controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.animation-toggle-btn {
  width: 100%;
  padding: 12px 16px;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.animation-toggle-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(240, 147, 251, 0.4);
}

.animation-toggle-btn.active {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
}

.animation-timeline,
.animation-speed {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.animation-timeline label,
.animation-speed label {
  font-size: 12px;
  color: #ccc;
}

.animation-timeline input[type='range'],
.animation-speed input[type='range'] {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  background: #2a2a2a;
  border-radius: 3px;
  outline: none;
}

.animation-timeline input[type='range']::-webkit-slider-thumb,
.animation-speed input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #667eea;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
}

.animation-timeline input[type='range']::-webkit-slider-thumb:hover,
.animation-speed input[type='range']::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.animation-timeline input[type='range']:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .model-viewer {
    flex-direction: column;
  }

  .viewer-container {
    height: 60vh;
  }

  .control-panel {
    width: 100%;
    height: 40vh;
  }
}
</style>
